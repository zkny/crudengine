const express       = require('express')
const fs            = require('fs')
const path          = require('path')
const multer        = require('multer')
const sharp         = require('sharp')
const CRUDFileModel = require('./schemas/CRUDFile')
const Fuse          = require('fuse.js')

const Router = express.Router()

class CrudEngine {

  constructor({MongooseConnection = require('mongoose'), SchemaDIR, ServiceDIR = null, FileDIR = null, ServeStaticPath = '/static', ImageHeightSize = 800, Thumbnail = false, ThumbnailSize = 250, MaxHeaderDepth = 2 }) {
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
    this.ImageHeightSize      = ImageHeightSize
    this.Thumbnail            = Thumbnail
    this.ThumbnailSize        = ThumbnailSize
    this.upload               = null

    console.log('\x1b[36m%s\x1b[0m', `
CRUDENGINE WARNING:
BREAKING CHANGES since version 1.4.2:

The following config fields were renamed:
  • alias -> name,
  • minReadAuth -> minReadAccess
  • minWriteAuth -> minWriteAccess
  
  Please update them, to have all the functionalities

The way accesslevel is handled has also changed.
The default accesslevel is now 0 and the higher an accesslevel is on a field, the higher accesslevel is needed to modify it.
There is also no maximum accesslevel.
    `)

    if(FileDIR) {
      if(!fs.existsSync(FileDIR)) fs.mkdirSync(path.resolve(FileDIR), { recursive: true })

      this.upload = multer({ dest: FileDIR })
    }

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
        C: {},
        R: {},
        U: {},
        D: {},
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
      this.WarnMixedType(fieldKey, field.name)  
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

  GenerateRoutes() {
    Router.get( '/schema', (req, res) => res.send(this.DecycledSchemas) )

    Router.get( '/schema/:model', (req, res) => res.send(this.DecycledSchemas[req.params.model]) )

    Router.post( '/schemakeys/:model', (req, res) => {
      res.send(this.GetSchemaKeys(req.params.model, req.body.depth))
    })

    Router.get( '/count/:model', (req, res) => {
      if(!req.query.filter) req.query.filter = '{}'

      this.MongooseConnection.model(req.params.model).countDocuments(JSON.parse(req.query.filter), (err, count) => {
        if(err) res.status(500).send(err)
        else res.send({count})
      })
    })

    if(this.FileDIR)
      Router.use( `${this.ServeStaticPath}`, express.static(path.resolve(__dirname, this.FileDIR)) )

    Router.get( '/getter/:service/:fun', (req, res) =>
      this.Services[req.params.service][req.params.fun]
        .call( null, { params: req.query } )
        .then( data => res.send(data) )
        .catch( error => res.status(500).send(error) )
    )

    Router.post( '/runner/:service/:fun', (req, res) =>
      this.Services[req.params.service][req.params.fun]
        .call( null, { params: req.body } )
        .then( data => res.send(data) )
        .catch( error => res.status(500).send(error) )
    )

    Router.get( '/tableheaders/:model', (req, res) => res.send(this.GetHeaders(req.params.model)) )

    Router.get( '/table/:model', async (req, res) => {
      if(!req.query.filter) req.query.filter = "{}"
      if(!req.query.sort) req.query.sort = "{}"

      const Headers = this.GetHeaders(req.params.model)
      const MFunctions = this.Middlewares[req.params.model].R

      if( MFunctions.before && (await eval(MFunctions.before)) == true ) return
      this.MongooseConnection.model(req.params.model)
        .find( JSON.parse(req.query.filter), req.query.projection )
        .lean({ autopopulate: true, virtuals: true, getters: true })
        .sort( JSON.parse(req.query.sort) )
        .skip( Number(req.query.skip) || 0 )
        .limit( Number(req.query.limit) || null )
        .then( async results => {
          this.RemoveDeclinedFields(req.params.model, results, req.accesslevel)
          if( MFunctions.after && (await eval(MFunctions.after)) == true ) return

          res.send({ Headers, Data: results })
        })
        .catch( error => res.status(500).send(error) )
    })

    Router.get( '/:model/find', async (req, res) => {
      if(!req.query.filter) req.query.filter = "{}"
      if(!req.query.sort) req.query.sort = "{}"

      const MFunctions = this.Middlewares[req.params.model].R

      if( MFunctions.before && (await eval(MFunctions.before)) == true ) return
      this.MongooseConnection.model(req.params.model)
        .find( JSON.parse(req.query.filter), req.query.projection )
        .lean({ autopopulate: true, virtuals: true, getters: true })
        .sort( JSON.parse(req.query.sort) )
        .skip( Number(req.query.skip) || 0 )
        .limit( Number(req.query.limit) || null )
        .then( async results => {
          this.RemoveDeclinedFields(req.params.model, results, req.accesslevel)
          if( MFunctions.after && (await eval(MFunctions.after)) == true ) return
          res.send(results)
        })
        .catch( error => res.status(500).send(error) )
    })

    Router.post( '/search/:model', async (req, res) => {
      const MFunctions = this.Middlewares[req.params.model].R
      if( MFunctions.before && (await eval(MFunctions.before)) == true ) return
      
      this.MongooseConnection.model(req.params.model)
        .find(req.body.filter || {})
        .lean({ autopopulate: true, virtuals: true, getters: true })
        .then( async allData => {
          this.RemoveDeclinedFields(req.params.model, allData, req.accesslevel)
          if( MFunctions.after && (await eval(MFunctions.after)) == true ) return
          
          if(!req.body.threshold) req.body.threshold = 0.4
          if(!req.body.pattern) return res.send(allData)
          if(!req.body.keys || req.body.keys.length == 0) req.body.keys = this.GetSchemaKeys(req.params.model, req.body.depth)

          const fuse = new Fuse(allData, {
            includeScore: false,
            keys: req.body.keys,
            threshold: req.body.threshold
          })

          let results = fuse.search(req.body.pattern).map(r => r.item)
          res.send(results)
        })
        .catch( error => res.status(500).send(error))
    })

    Router.get( "/:model/:id", async (req, res) => {
      const MFunctions = this.Middlewares[req.params.model].R
      if( MFunctions.before && (await eval(MFunctions.before)) == true ) return

      this.MongooseConnection.model(req.params.model)
        .findOne({_id: req.params.id}, req.query.projection)
        .lean({ autopopulate: true, virtuals: true, getters: true })
        .then( async results => {
          this.RemoveDeclinedFieldsFromObject(this.Schemas[this.BaseDBString][req.params.model], results, req.accesslevel)
          if( MFunctions.after && (await eval(MFunctions.after)) == true ) return

          res.send(results)
        })
        .catch( error => res.status(500).send(error))
    })

    if(this.FileDIR) {
      // TODO
      Router.post( "/fileupload", this.upload.single('file'), (req, res) => {
        if(req.file.mimetype.split('/')[0] == 'image') return this.handleImageUpload(req, res)

        let file          = JSON.parse(JSON.stringify(req.file))
        let extension     = file.originalname.split('.').pop()
        let filePath      = `${file.filename}.${extension}`

        fs.renameSync(req.file.path, `${file.path}.${extension}`)

        let fileData = {
          name: file.originalname,
          path: filePath,
          size: file.size,
          extension: extension,
        }
        CRUDFileModel.create(fileData, (err, file) => {
          if(err) res.status(500).send(err)
          else res.send(file)
        })
      })

      // TODO
      Router.delete( "/filedelete/:id", (req, res) => {
        CRUDFileModel.findOne({_id: req.params.id})
          .then( file => {
            let realPath = path.resolve( this.FileDIR, file.path )
            if(realPath.indexOf(this.FileDIR) != 0) return res.status(500).send('Invalid file path!')

            fs.unlinkSync(realPath)
            let thumbnailPath = realPath.replace('.', '_thumbnail.')
            if(fs.existsSync(thumbnailPath)) fs.unlinkSync(thumbnailPath)

            CRUDFileModel.deleteOne({_id: file._id})
              .then( () => res.send() )
              .catch( err => res.status(500).send(err) )
          })
          .catch( err => res.status(500).send(err) )
      })
    }

    Router.post( "/:model", async (req, res) => {
      this.RemoveDeclinedFieldsFromObject(this.Schemas[this.BaseDBString][req.params.model], req.body, req.accesslevel, 'minWriteAccess')

      const MFunctions = this.Middlewares[req.params.model].C
      if( MFunctions.before && (await eval(MFunctions.before)) == true ) return

      const Model = this.MongooseConnection.model(req.params.model)
      const ModelInstance = new Model(req.body)
      ModelInstance.save()
        .then( async results => {
          this.RemoveDeclinedFieldsFromObject(this.Schemas[this.BaseDBString][req.params.model], results, req.accesslevel)
          if( MFunctions.after && (await eval(MFunctions.after)) == true ) return

          res.send(results)
        })
        .catch( err => res.status(500).send(err) )
    })

    Router.patch( "/:model", async (req, res) => {
      this.RemoveDeclinedFieldsFromObject(this.Schemas[this.BaseDBString][req.params.model], req.body, req.accesslevel, 'minWriteAccess')
      
      const MFunctions = this.Middlewares[req.params.model].U
      if( MFunctions.before && (await eval(MFunctions.before)) == true ) return

      this.MongooseConnection.model(req.params.model)
        .updateOne({ _id: req.body._id }, req.body)
        .then(async results => {
          if( MFunctions.after && (await eval(MFunctions.after)) == true ) return

          res.send(results)
        })
        .catch( err => res.status(500).send(err) )
    })

    Router.delete( "/:model/:id", async (req, res) => {
      const declinedPaths = this.GetDeclinedPaths(req.params.model, req.accesslevel, 'minWriteAccess', true)
      if(declinedPaths.length) return res.status(500).send('EPERM')
      
      const MFunctions = this.Middlewares[req.params.model].D
      if( MFunctions.before && (await eval(MFunctions.before)) == true ) return

      this.MongooseConnection.model(req.params.model)
        .deleteOne({ _id: req.params.id })
        then(async results => {
          if( MFunctions.after && (await eval(MFunctions.after)) == true ) return
          
          res.send(results)
        })
        .catch( err => res.status(500).send(err) )
    })

    return Router
  }

  // TODO
  handleImageUpload(req, res) {
    let file          = JSON.parse(JSON.stringify(req.file))
    let extension     = file.originalname.split('.').pop()
    let filePath      = `${file.filename}.${extension}`

    sharp(req.file.path)
    .resize({
      height: this.ImageHeightSize,
      withoutEnlargement: true
    })
    .toFile(`${file.path}.${extension}`, (err, info) => {
      if(err) return res.send(err)

      let fileData = {
        name: file.originalname,
        path: filePath,
        size: file.size,
        extension: extension,
        isImage: true
      }

      if(this.Thumbnail) {
        return sharp(req.file.path)
        .resize({
          height: this.ThumbnailSize,
          withoutEnlargement: true
        })
        .toFile(`${file.path}_thumbnail.${extension}`, (err, th_info) => {
          if(err) return res.send(err)

          fileData.thumbnailPath = `${file.filename}_thumbnail.${extension}`

          fs.unlinkSync(file.path)

          CRUDFileModel.create(fileData, (err, file) => {
            if(err) res.status(500).send(err)
            else res.send(file)
          })
        })
      }

      fs.unlinkSync(file.path)

      CRUDFileModel.create(fileData, (err, file) => {
        if(err) res.status(500).send(err)
        else res.send(file)
      })
    })
  }

  addMiddleware( modelName, operation, timing, middlewareFunction ) {
    return new Promise( (resolve, reject) => {
      if( !this.Middlewares[modelName] ) return reject( new Error(`Middleware: No model found with name: ${modelName}`) )
      if( !this.Operations.includes(operation) ) return reject( new Error(`Middleware: Operation should be one of: ${this.Operations}`) )
      if( !this.Timings.includes(timing) ) return reject( new Error(`Middleware: Timing should be one of: ${this.Timings}`) )

      this.Middlewares[modelName][operation][timing] = `(${middlewareFunction.toString()})()`
      return resolve('Middleware added')
    })
  }

  WarnMixedType(key, name) {
    console.log('\x1b[36m%s\x1b[0m', `
CRUDENGINE WARNING:
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
}

module.exports = CrudEngine
