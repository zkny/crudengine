const express       = require('express')
const fs            = require('fs')
const path          = require('path')
const multer        = require('multer')
const sharp         = require('sharp')
const CRUDFileModel = require('./schemas/CRUDFile')
const Fuse          = require('fuse.js')

const Router = express.Router()

class CrudEngine {
  constructor({
      MongooseConnection = require('mongoose'),
      SchemaDIR,
      ServiceDIR = null,
      FileDIR = null,
      ServeStaticPath = '/static',
      MaxImageSize = 800,
      CreateThumbnail = false,
      MaxThumbnailSize = 200,
      MaxHeaderDepth = 2,
      ShowLogs = true,
      ShowWarnings = true,
      ShowErrors = true,
    }) {
    this.MongooseConnection   = MongooseConnection
    this.BaseDBString         = MongooseConnection.connections[0]._connectionString
    this.FileDIR              = FileDIR
    this.ServeStaticPath      = ServeStaticPath
    this.SchemaDIR            = SchemaDIR
    this.ServiceDIR           = ServiceDIR
    this.Schemas              = {[this.BaseDBString]: {}}
    this.PathSchemas          = {}
    this.DecycledSchemas      = {}
    this.CRUDFileShema        = []
    this.Services             = {}
    this.Middlewares          = {}
    this.Operations           = ['C', 'R', 'U', 'D']
    this.Timings              = ['after', 'before']
    this.MaxHeaderDepth       = MaxHeaderDepth
    this.MaxImageSize         = MaxImageSize
    this.CreateThumbnail      = CreateThumbnail
    this.MaxThumbnailSize        = MaxThumbnailSize
    this.ShowLogs             = ShowLogs
    this.ShowWarnings         = ShowWarnings
    this.ShowErrors           = ShowErrors
    this.upload               = null

    this.LogBreakingChanges()

    if(FileDIR)
      this.upload = multer({dest: FileDIR})

    if(ServiceDIR) {
      for( const ServiceFile of fs.readdirSync(ServiceDIR) ) {
        if( !ServiceFile.endsWith('.js') ) continue
        
        const ServiceName = ServiceFile.replace( '.js', '' )
        
        this.Services[ServiceName] = require(`${ServiceDIR}/${ServiceFile}`)
      }
    }

    this.CRUDFileShema = this.GenerateSchema(CRUDFileModel)
    this.GenerateSchemas()
    this.GenerateDecycledSchemas()
    this.GeneratePathSchemas()
  }

  GenerateSchemas() {
    for( const SchemaFile of fs.readdirSync(this.SchemaDIR) ) {
      if( !SchemaFile.endsWith('.js') ) continue

      let model = require(`${this.SchemaDIR}/${SchemaFile}`)
      let modelName = model.modelName || model.default.modelName

      this.Schemas[this.BaseDBString][modelName] = this.GenerateSchema(model)
      this.Middlewares[modelName] = {
        C: { before: () => Promise.resolve(), after: () => Promise.resolve()},
        R: { before: () => Promise.resolve(), after: () => Promise.resolve()},
        U: { before: () => Promise.resolve(), after: () => Promise.resolve()},
        D: { before: () => Promise.resolve(), after: () => Promise.resolve()},
      }
    }

    for(let DBString in this.Schemas)
      for(let modelName in this.Schemas[DBString])
        for(let fieldObj of this.Schemas[DBString][modelName])
          this.plugInFieldRef(fieldObj)
  }

  GenerateSchema(model) {
    const Paths = this.GetPaths(model.schema)
    let fields = []

    for(const FieldPath in Paths)
      this.GenerateObjFieldTree(fields, FieldPath, Paths[FieldPath])

    return fields
  }

  GenerateDecycledSchemas() {
    for(let modelName in this.Schemas[this.BaseDBString]) {
      const DecycledSchema = this.CopySubheaders({subheaders: this.Schemas[this.BaseDBString][modelName]})
      this.DecycledSchemas[modelName] = DecycledSchema.subheaders
      
      for(let field of this.DecycledSchemas[modelName])
        this.DecycleField(field)
    }
  }

  DecycleField(fieldObj, refs = []) {
    if(!fieldObj.subheaders) return

    let refId = `${fieldObj.DBString}:${fieldObj.ref}`
    if(refs.includes(refId)) return fieldObj.subheaders = []
    if(fieldObj.ref) refs.push(refId)

    this.CopySubheaders(fieldObj)

    for(let field of fieldObj.subheaders)
      this.DecycleField(field, [...refs])
  }

  CopySubheaders(field) {
    field.subheaders = [...field.subheaders]
    
    for(let i=0; i<field.subheaders.length; ++i)
      field.subheaders[i] = {...field.subheaders[i]}

    return field
  }

  GeneratePathSchemas() {
    for(let modelName in this.DecycledSchemas) {
      this.PathSchemas[modelName] = {}
  
      for(let field of this.DecycledSchemas[modelName])
        this.GeneratePathSchema(field, this.PathSchemas[modelName])
    }
  }
  
  GeneratePathSchema(field, acc, prefix = '') {
    acc[`${prefix}${field.key}`] = field
    
    if(field.subheaders)
      for(let f of field.subheaders)
        this.GeneratePathSchema(f, acc, `${prefix}${field.key}.`)
  }

  GetSchemaKeys(modelName, maxDepth = this.MaxHeaderDepth) {
    let keys = []

    for(let field of this.DecycledSchemas[modelName])
      this.GenerateSchemaKeys(field, keys, maxDepth)

    let keys
  }

  GenerateSchemaKeys(field, keys, maxDepth, prefix = '', depth = 0) {
    if(depth > maxDepth) return

    if(!['Object', 'Date'].some(t => field.type == t) && !field.subheaders) keys.push(`${prefix}${field.key}`)
    
    if(field.subheaders)
      for(let f of field.subheaders)
        this.GenerateSchemaKeys(f, keys, maxDepth, `${prefix}${field.key}.`, depth+1)
  }

  GetPaths(schema, acc = {}, prefix = '') {
    const JoinedPaths = {...schema.paths, ...schema.subpaths}

    for(let key in JoinedPaths) {
      const CurrPath = JoinedPaths[key]
      const PrefixedKey = prefix + key

      acc[PrefixedKey] = CurrPath
      if(CurrPath.schema) this.GetPaths(CurrPath.schema, acc, `${PrefixedKey}.`)
    }

    return acc
  }

  GenerateObjFieldTree(currentFieldLevel, fieldPath, mongooseFieldDescriptor) {
    let fieldKeys = fieldPath.split('.')
    let lastName = fieldKeys.pop()

    if( ['_id', '__v', '$'].some(s => lastName == s) ) return

    for(const fieldKey of fieldKeys) {
      let ind = 0
      while( ind < currentFieldLevel.length && currentFieldLevel[ind].key != fieldKey ) ind++

      if(ind == currentFieldLevel.length)
        currentFieldLevel.push({
          key: fieldKey,
          isArray: false,
          type: 'Object',
          required: false,
          ref:  null,
          name: fieldKey,
          description: null,
          default: null,
          minReadAccess: 0,
          minWriteAccess: 0,
          subheaders: []
        })

      currentFieldLevel = currentFieldLevel[ind].subheaders
    }

    currentFieldLevel.push( this.GenerateSchemaField(lastName, mongooseFieldDescriptor) )
  }

  GenerateSchemaField(fieldKey, mongooseFieldDescriptor) {
    let field = {
      key: fieldKey,
      isArray: mongooseFieldDescriptor.instance == 'Array',
      type: mongooseFieldDescriptor.instance,
      required: mongooseFieldDescriptor.options.required || false,
      ref: mongooseFieldDescriptor.options.ref || null,
      name: mongooseFieldDescriptor.options.name || null,
      description: mongooseFieldDescriptor.options.description || null,
      default: mongooseFieldDescriptor.options.default || null,
      minReadAccess: mongooseFieldDescriptor.options.minReadAccess || 0,
      minWriteAccess: mongooseFieldDescriptor.options.minWriteAccess || 0,
    }
    if(mongooseFieldDescriptor.options.primary) field.primary = true
    if(mongooseFieldDescriptor.options.hidden) field.hidden = true

    if(field.isArray) {
      const Emb = mongooseFieldDescriptor.$embeddedSchemaType

      if(!Emb.instance) field.subheaders = []
      if(Emb.options.primary) field.primary = true
      if(Emb.options.hidden) field.hidden = true
      field.type = Emb.instance || 'Object'
      field.ref = Emb.options.ref || field.ref
      field.name = field.name || Emb.options.name || null
      field.description = field.description || Emb.options.description || null
      field.default = field.default || Emb.options.default || null
      field.minReadAccess = Math.max(field.minReadAccess, (Emb.options.minReadAccess || 0))
      field.minWriteAccess = Math.max(field.minWriteAccess, (Emb.options.minWriteAccess || 0))
    }

    if(field.type == 'ObjectID') field.type = 'Object'
    else if(field.type == 'Embedded') {
      field.type = 'Object'
      field.subheaders = []
    }
    else if(field.type == 'Mixed') {
      field.type = 'Object'
      this.LogMixedType(fieldKey, field.name)  
    }

    if(field.ref) {
      let givenRef = field.ref
      let isModel = typeof givenRef == 'function'

      field.DBString = isModel ? givenRef.db._connectionString : this.BaseDBString
      field.ref = isModel ? givenRef.modelName : givenRef
      
      if(field.DBString != this.BaseDBString) {
        if(!this.Schemas[field.DBString]) this.Schemas[field.DBString] = {}
        this.Schemas[field.DBString][field.ref] = this.GenerateSchema(givenRef)
      }
    }

    return field
  }

  plugInFieldRef(fieldObj) {
    if(!fieldObj.ref && !fieldObj.subheaders) return

    if(fieldObj.ref) {
      if(fieldObj.ref == 'CRUDFile') return fieldObj.subheaders = this.CRUDFileShema
      if(this.Schemas[fieldObj.DBString][fieldObj.ref]) return fieldObj.subheaders = this.Schemas[fieldObj.DBString][fieldObj.ref]
    }

    for(const fObj of fieldObj.subheaders)
      this.plugInFieldRef(fObj)
  }

  GetDeclinedPaths(modelName, accesslevel = 0, authField = 'minReadAccess', excludeSubKeys = false) {
      let fieldEntries = Object.entries(this.PathSchemas[modelName])

      if(excludeSubKeys) fieldEntries = fieldEntries.filter( ([key, field]) => !key.includes('.') )
      fieldEntries = fieldEntries.filter( ([key, field]) => field[authField] > accesslevel )
      
      return fieldEntries.map(entr => entr[0])
  }

  RemoveDeclinedFields(modelName, documents, accesslevel = 0, authField = 'minReadAccess') {
    for(const document of documents)
      this.RemoveDeclinedFieldsFromObject(this.Schemas[this.BaseDBString][modelName], document, accesslevel, authField)

    return documents
  }

  RemoveDeclinedFieldsFromObject(fields, object, accesslevel = 0, authField = 'minReadAccess') {
    for(let field of fields) {
      if(field[authField] > accesslevel) delete object[field.key]

      else if(field.subheaders && object[field.key]) {
        if(field.isArray) object[field.key].forEach( obj => this.RemoveDeclinedFieldsFromObject(field.subheaders, obj, accesslevel, authField) )
        else this.RemoveDeclinedFieldsFromObject(field.subheaders, object[field.key], accesslevel, authField)
      }
    }
  }

  GetHeaders(schema, depth = 0) {
    if(typeof schema == 'string') schema = this.Schemas[this.BaseDBString][schema]
    let headers = []

    for(let field of schema) {
      if(field.hidden) continue
      let hField = {}

      for(let key of ['name', 'key', 'description', 'type', 'isArray', 'primary'])
        hField[key] = field[key]

      if(field.subheaders && depth < this.MaxHeaderDepth)
        hField.subheaders = this.GetHeaders(field.subheaders, field.ref ? depth+1 : depth)

      headers.push(hField)
    }

    return headers
  }

  handleImageUpload(req, res) {
    let multerPath    = req.file.path
    let extension     = req.file.originalname.split('.').pop()
    let filePath      = `${req.file.filename}.${extension}`

    this.resizeImageTo(multerPath, this.MaxImageSize, `${multerPath}.${extension}`)
      .then( () => {
        if(this.CreateThumbnail)
          return this.resizeImageTo(multerPath, this.MaxThumbnailSize, `${multerPath}_thumbnail.${extension}`)
        else
          return Promise.resolve()
      })
      .then( () => fs.promises.unlink(multerPath) )
      .then( () => CRUDFileModel.create({
        name: req.file.originalname,
        path: filePath,
        size: req.file.size,
        extension: extension,
        isImage: true,
        ...this.CreateThumbnail && {thumbnailPath: `${req.file.filename}_thumbnail.${extension}`}
      }))
      .then( file => res.send(file) )
      .catch( err => {
        console.error(err)
        res.status(500).send(err)
      })
  }

  resizeImageTo(sourcePath, size, destinationPath) {
    if(size == null) return fs.promises.copyFile(sourcePath, destinationPath)
    
    return new Promise( (resolve, reject) => {
      sharp(sourcePath)
        .resize(size, size, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .toFile(destinationPath, (err, info) => {
          if(err) reject(err)
          else resolve(info)
        })
    })
  }

  addMiddleware(modelName, operation, timing, middlewareFunction) {
    if(!this.Middlewares[modelName]) {
      this.LogMissingModel(modelName)
      throw new Error(`MISSING MODEL: ${modelName}`)
    }
    if(!this.Operations.includes(operation)) {
      this.LogUnknownOperation(operation)
      throw new Error(`Middleware: Operation should be one of: ${this.Operations}`)
    }
    if(!this.Timings.includes(timing)) {
      this.LogUnknownTiming(timing)
      throw new Error(`Middleware: Timing should be one of: ${this.Timings}`)
    }

    this.Middlewares[modelName][operation][timing] = middlewareFunction
}

  CRUDRoute(req, res, mainPart, responsePart, operation) {
    if(!this.Schemas[this.BaseDBString][req.params.model]) {
      this.LogMissingModel(req.params.model)
      return res.status(500).send('MISSING MODEL')
    }

    const MiddlewareFunctions = this.Middlewares[req.params.model][operation]
    MiddlewareFunctions.before.call(this, req, res)
      .then( () => {
        mainPart.call(this, req, res)
          .then( result => {
            MiddlewareFunctions.after.call(this, req, res, result)
              .then( () => {
                responsePart.call(this, req, res, result)
                  .catch( err => {res.status(500).send(err); console.log(err)} )
              })
              .catch( message => this.LogMiddlewareMessage(req.params.model, operation, 'after', message) )
          })
          .catch( err => {res.status(500).send(err); console.log(err)} )
      })
      .catch( message => this.LogMiddlewareMessage(req.params.model, operation, 'before', message) )
  }

  ServiceRoute(req, res, paramsKey) {
    if(!this.Services[req.params.service]) {
      this.LogMissingService(req.params.service)
      return res.status(500).send('MISSING SERVICE')
    }
    if(!this.Services[req.params.service][req.params.fun]) {
      this.LogMissingServiceFunction(req.params.service, req.params.fun)
      return res.status(500).send('MISSING SERVICE FUNCTION')
    }

    this.Services[req.params.service][req.params.fun]
      .call( null, req[paramsKey] )
      .then( result => res.send(result) )
      .catch( error => res.status(500).send(error) )
  }

  GenerateRoutes() {
    Router.get( '/schema', (req, res) => res.send(this.DecycledSchemas) )

    Router.get( '/schema/:model', (req, res) => {
      if(!this.Schemas[this.BaseDBString][req.params.model]) {
        this.LogMissingModel(req.params.model)
        return res.status(500).send('MISSING MODEL')
      }

      res.send(this.DecycledSchemas[req.params.model])
    })

    Router.post( '/schemakeys/:model', (req, res) => {
      if(!this.Schemas[this.BaseDBString][req.params.model]) {
        this.LogMissingModel(req.params.model)
        return res.status(500).send('MISSING MODEL')
      }

      res.send(this.GetSchemaKeys(req.params.model, req.body.depth))
    })

    Router.get( '/count/:model', (req, res) => {
      if(!this.Schemas[this.BaseDBString][req.params.model]) {
        this.LogMissingModel(req.params.model)
        return res.status(500).send('MISSING MODEL')
      }

      if(!req.query.filter) req.query.filter = '{}'

      this.MongooseConnection.model(req.params.model).countDocuments(JSON.parse(req.query.filter), (err, count) => {
        if(err) res.status(500).send(err)
        else res.send({count})
      })
    })

    Router.get( '/tableheaders/:model', (req, res) => {
      if(!this.Schemas[this.BaseDBString][req.params.model]) {
        this.LogMissingModel(req.params.model)
        return res.status(500).send('MISSING MODEL')
      }

      res.send(this.GetHeaders(req.params.model))
    })

    Router.get( '/getter/:service/:fun', (req, res) => {
      this.ServiceRoute(req, res, 'query')
    })

    Router.post( '/runner/:service/:fun', (req, res) => {
      this.ServiceRoute(req, res, 'body')
    })

    if(this.FileDIR) {
      Router.use( `${this.ServeStaticPath}`, express.static(path.resolve(__dirname, this.FileDIR)) )
      Router.use( `${this.ServeStaticPath}`, (req, res) => res.status(404).send('NOT FOUND') )

      Router.post( "/fileupload", this.upload.single('file'), (req, res) => {
        if(req.file.mimetype.startsWith('image')) return this.handleImageUpload(req, res)

        let multerPath    = req.file.path
        let extension     = req.file.originalname.split('.').pop()
        let filePath      = `${req.file.filename}.${extension}`

        fs.renameSync(multerPath, `${multerPath}.${extension}`)

        let fileData = {
          name: req.file.originalname,
          path: filePath,
          size: req.file.size,
          extension: extension,
        }

        CRUDFileModel.create(fileData, (err, file) => {
          if(err) res.status(500).send(err)
          else res.send(file)
        })
      })

      Router.delete( "/filedelete/:id", (req, res) => {
        CRUDFileModel.findOne({_id: req.params.id})
          .then( file => {
            let realPath = path.resolve(this.FileDIR, file.path)
            let thumbnailPath = realPath.replace('.', '_thumbnail.')
            if(!realPath.startsWith(this.FileDIR)) return res.status(500).send('INVALID PATH')

            if(fs.existsSync(realPath)) fs.unlinkSync(realPath)
            if(fs.existsSync(thumbnailPath)) fs.unlinkSync(thumbnailPath)

            CRUDFileModel.deleteOne({_id: file._id})
              .then( () => res.send() )
              .catch( err => res.status(500).send(err) )
          })
          .catch( err => res.status(500).send(err) )
      })
    }

    Router.get( '/:model/find', (req, res) => {
      function mainPart(req, res) {
        if(!req.query.filter) req.query.filter = "{}"
        if(!req.query.sort) req.query.sort = "{}"

        return this.MongooseConnection.model(req.params.model)
          .find( JSON.parse(req.query.filter), req.query.projection )
          .lean({ autopopulate: true, virtuals: true, getters: true })
          .sort( JSON.parse(req.query.sort) )
          .skip( Number(req.query.skip) || 0 )
          .limit( Number(req.query.limit) || null )
      }

      async function responsePart(req, res, results) {
        this.RemoveDeclinedFields(req.params.model, results, req.accesslevel)

        res.send(results)
      }

      this.CRUDRoute(req, res, mainPart, responsePart, 'R')
    })

    Router.post( '/search/:model', async (req, res) => {
      function mainPart(req, res) {
        return this.MongooseConnection.model(req.params.model)
          .find(req.body.filter || {})
          .lean({ autopopulate: true, virtuals: true, getters: true })
      }

      async function responsePart(req, res, results) {
        this.RemoveDeclinedFields(req.params.model, results, req.accesslevel)
        
        if(!req.body.threshold) req.body.threshold = 0.4
        if(!req.body.pattern) return res.send(results)
        if(!req.body.keys || req.body.keys.length == 0) req.body.keys = this.GetSchemaKeys(req.params.model, req.body.depth)
  
        const fuse = new Fuse(results, {
          includeScore: false,
          keys: req.body.keys,
          threshold: req.body.threshold
        })
  
        let results = fuse.search(req.body.pattern).map(r => r.item)
        res.send(results)
      }

      this.CRUDRoute(req, res, mainPart, responsePart, 'R')
    })

    Router.get( "/:model/:id", async (req, res) => {
      function mainPart(req, res) {
        return this.MongooseConnection.model(req.params.model)
          .findOne({_id: req.params.id}, req.query.projection)
          .lean({ autopopulate: true, virtuals: true, getters: true })
      }

      async function responsePart(req, res, result) {
        this.RemoveDeclinedFieldsFromObject(this.Schemas[this.BaseDBString][req.params.model], result, req.accesslevel)

        res.send(result)
      }

      this.CRUDRoute(req, res, mainPart, responsePart, 'R')
    })

    Router.post( "/:model", async (req, res) => {
      function mainPart(req, res) {
        this.RemoveDeclinedFieldsFromObject(this.Schemas[this.BaseDBString][req.params.model], req.body, req.accesslevel, 'minWriteAccess')
  
        const Model = this.MongooseConnection.model(req.params.model)
        const ModelInstance = new Model(req.body)
        return ModelInstance.save()
      }

      async function responsePart(req, res, result) {
        this.RemoveDeclinedFieldsFromObject(this.Schemas[this.BaseDBString][req.params.model], result, req.accesslevel)
  
        res.send(result)
      }

      this.CRUDRoute(req, res, mainPart, responsePart, 'C')
    })

    Router.patch( "/:model", async (req, res) => {
      function mainPart(req, res) {
        this.RemoveDeclinedFieldsFromObject(this.Schemas[this.BaseDBString][req.params.model], req.body, req.accesslevel, 'minWriteAccess')

        return this.MongooseConnection.model(req.params.model)
          .updateOne({ _id: req.body._id }, req.body)
      }

      async function responsePart(req, res, result) {
        res.send(result)
      }

      this.CRUDRoute(req, res, mainPart, responsePart, 'U')
    })

    Router.delete( "/:model/:id", async (req, res) => {
      function mainPart(req, res) {
        const declinedPaths = this.GetDeclinedPaths(req.params.model, req.accesslevel, 'minWriteAccess', true)
        if(declinedPaths.length) return Promise.reject('PERMISSION DENIED')
  
        return this.MongooseConnection.model(req.params.model)
        .deleteOne({ _id: req.params.id })
      }

      async function responsePart(req, res, result) {
        res.send(result)
      }

      this.CRUDRoute(req, res, mainPart, responsePart, 'D')
    })

    return Router
  }

  LogBreakingChanges() {
    console.log('\x1b[36m\x1b[4m\x1b[1m%s\x1b[0m', '\nCRUDENGINE CHANGES:')
    console.log('\x1b[36m%s\x1b[0m', `
BREAKING CHANGES since version 1.4.2:

The following config fields were renamed:
  • alias -> name,
  • minReadAuth -> minReadAccess
  • minWriteAuth -> minWriteAccess
  
  Please update them, to have all the functionalities.

The way accesslevel is handled has also changed.
The default accesslevel is now 0 and the higher an accesslevel is on a field, the higher accesslevel is needed to modify it.
There is also no maximum accesslevel.\n`)
  }

  LogMixedType(key, name) {
    if(!this.ShowWarnings) return

    console.log('\x1b[93m\x1b[4m\x1b[1m%s\x1b[0m', '\nCRUDENGINE WARNING:')
    console.log('\x1b[93m%s\x1b[0m', `
'Mixed' type field '${key}'!
To get subheaders for this field use the following syntax:
${key}: {
  name: ${name},
  type: new mongoose.Schema({
    key: value
  }),
  ...
}

Instead of:
${key}: {
  name: ${name},
  type: {
    key: value
  },
  ...
}\n`)
  }

  LogMissingModel(modelName) {
    if(!this.ShowErrors) return
    
    console.log('\x1b[91m\x1b[4m\x1b[1m%s\x1b[0m', '\nCRUDENGINE ERROR:')
    console.log('\x1b[91m%s\x1b[0m', `
MISSING MODEL: '${modelName}'

There is no model registered with the name '${modelName}'.
This is most likely just a typo.

If the name is correct check, if:
  • the file containg the model is in the folder which was given to crudengine
  • the file is exporting the model, so crudengine can import it\n`)
  }

  LogMissingService(serviceName) {
    if(!this.ShowErrors) return
    
    console.log('\x1b[91m\x1b[4m\x1b[1m%s\x1b[0m', '\nCRUDENGINE ERROR:')
    console.log('\x1b[91m%s\x1b[0m', `
MISSING SERVICE: '${serviceName}'

There is no service registered with the name '${serviceName}'.
This is most likely just a typo.

If the name is correct check, if:
  • the file containg the service is in the folder which was given to crudengine
  • the file is exporting the service, so crudengine can import it\n`)
  }

  LogMissingServiceFunction(serviceName, functionName) {
    if(!this.ShowErrors) return
    
    console.log('\x1b[91m\x1b[4m\x1b[1m%s\x1b[0m', '\nCRUDENGINE ERROR:')
    console.log('\x1b[91m%s\x1b[0m', `
MISSING SERVICE FUNCTION: '${functionName}'

There is no function in the service '${serviceName}' with the name '${functionName}'.
This is most likely just a typo.

If the name is correct check, if:
  • the '${serviceName}' service is the one containing the function\n`)
  }

LogUnknownOperation(operation) {
  if(!this.ShowErrors) return
  
  console.log('\x1b[91m\x1b[4m\x1b[1m%s\x1b[0m', '\nCRUDENGINE ERROR:')
  console.log('\x1b[91m%s\x1b[0m', `
UNKNOWN OPERATION: '${operation}'

The operation '${operation}' is not known.
Operation should be one of:
  • 'C'
  • 'R'
  • 'U'
  • 'D'\n`)
  }

LogUnknownTiming(timing) {
  if(!this.ShowErrors) return
  
  console.log('\x1b[91m\x1b[4m\x1b[1m%s\x1b[0m', '\nCRUDENGINE ERROR:')
  console.log('\x1b[91m%s\x1b[0m', `
UNKNOWN TIMING: '${timing}'

The timing '${timing}' is not known.
Timing should be one of:
  • 'before'
  • 'after'\n`)
  }

LogMiddlewareMessage(modelName, operation, timing, message) {
  if(!this.ShowLogs) return
  
  console.log('\x1b[34m\x1b[4m\x1b[1m%s\x1b[0m', '\nCRUDENGINE LOG:')
  console.log('\x1b[34m%s\x1b[0m', `
REQUEST STOPPED 

The custom '${modelName} -> ${operation} -> ${timing}' middleware stopped a request.
Given reason: '${message}'\n`)
  }
}

module.exports = CrudEngine
