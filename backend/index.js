const express       = require('express')
const fs            = require('fs')
const path          = require('path')
const multer        = require('multer')
const sharp         = require('sharp')
const CRUDFile      = require('./schemas/CRUDFile')
const Fuse          = require('fuse.js')

const Router = express.Router()

class CrudEngine {

  constructor({MongooseConnection = require('mongoose'), SchemaDIR, ServiceDIR = null, FileDIR = null, ServeStaticPath = '/static', ImageHeightSize = 800, Thumbnail = false, ThumbnailSize = 250, MaxHeaderDepth = 2 }) {
    this.BaseDBString         = MongooseConnection.connections[0]._connectionString
    this.Schemas              = {[this.BaseDBString]: {}}
    this.PathSchemas          = {}
    this.DecycledSchemas      = {}
    this.CRUDFileShema        = []
    this.Services             = {}
    this.Middlewares          = {}
    this.Operations           = ['C', 'R', 'U', 'D']
    this.Timings              = ['after', 'before']
    this.MongooseConnection   = MongooseConnection
    this.ImageHeightSize      = ImageHeightSize
    this.Thumbnail            = Thumbnail
    this.ThumbnailSize        = ThumbnailSize
    this.FileDIR              = FileDIR
    this.ServeStaticPath      = ServeStaticPath
    this.SchemaDIR            = SchemaDIR
    this.ServiceDIR           = ServiceDIR
    this.MaxHeaderDepth       = MaxHeaderDepth

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

    if (FileDIR) {
      if(!fs.existsSync(FileDIR))
        fs.mkdirSync(path.resolve(FileDIR), { recursive: true })

      this.upload = multer({ dest: FileDIR })
    }

    if( ServiceDIR ) {
      const ServiceFileArray = fs.readdirSync( ServiceDIR )
      for( const ServiceFile of ServiceFileArray ) {
        if( !ServiceFile.endsWith('.js') ) continue
        
        const ServiceName = ServiceFile
        .replace( '.js', '' )
        .replace( '.ts', '' )
        .replace( '.coffee', '' )
        
        this.Services[ServiceName] = require(`${ServiceDIR}/${ServiceFile}`)
      }
    }

    let rawSchemas = {}
    let CRUDFileSchema = require('./schemas/CRUDFile')
    for( const SchemaFile of fs.readdirSync(SchemaDIR) ) {
      if( SchemaFile == '.DS_Store' || SchemaFile.includes('.map') ) continue

      let schemaObj = require(`${SchemaDIR}/${SchemaFile}`)

      let modelname = schemaObj.modelName || schemaObj.default.modelName

      rawSchemas[modelname] = schemaObj
      this.Middlewares[modelname] = {
        C: {},
        R: {},
        U: {},
        D: {},
      }
    }

    this.CRUDFileShema = this.GenerateSchema(CRUDFileSchema)
    this.GenerateSchemas(rawSchemas)
    this.GenerateDecycledSchemas()
    this.GeneratePathSchemas()
  }

  GenerateSchemas(RawSchemas) {
    for(let modelName in RawSchemas)
    this.Schemas[this.BaseDBString][modelName] = this.GenerateSchema(RawSchemas[modelName])

    for(let DBString in this.Schemas)
      for(let modelName in this.Schemas[DBString])
        for(const FieldObj of this.Schemas[DBString][modelName])
          this.plugInFieldRef(FieldObj)
  }

  GenerateSchema(RawSchema) {
    const Paths = this.GetPaths(RawSchema.schema)
    let fields = []

    for(const FieldPath in Paths)
      this.GenerateObjFieldChain(Paths[FieldPath], FieldPath, fields)

    return fields
  }

  GenerateDecycledSchemas() {
    for(let modelName in this.Schemas[this.BaseDBString]) {
      this.DecycledSchemas[modelName] = this.CopySubheaders({subheaders: this.Schemas[this.BaseDBString][modelName]}).subheaders
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
    for(let schema in this.DecycledSchemas) {
      this.PathSchemas[schema] = {}
  
      for(let field of this.DecycledSchemas[schema])
        this.GeneratePathSchema(field, this.PathSchemas[schema])
    }
  }
  
  GeneratePathSchema(field, acc, prefix = '') {
    acc[`${prefix}${field.key}`] = field
    
    if(field.subheaders)
      for(let f of field.subheaders)
        this.GeneratePathSchema(f, acc, `${prefix}${field.key}.`)
  }

  GetSchemaKeys(schema, maxDepth = this.MaxHeaderDepth) {
    const keys = []

    for(let field of this.DecycledSchemas[schema])
      this.GenerateSchemaKeys(field, keys, maxDepth)

    return keys
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

  GenerateObjFieldChain(FieldObj, FieldPath, cursor) {
    let FieldKeys = FieldPath.split('.')
    let lastName = FieldKeys[FieldKeys.length-1]

    if( ['_id', '__v', '$'].some(s => lastName == s) ) return

    for( let FieldKey of FieldKeys.slice(0, FieldKeys.length-1) ) {
      let ind = 0
      while( ind < cursor.length && cursor[ind].key != FieldKey ) ind++

      if(ind == cursor.length)
        cursor.push({
          key: FieldKey,
          isArray: false,
          type: 'Object',
          required: false,
          ref:  null,
          name: FieldKey,
          description: null,
          default: null,
          minReadAccess: 0,
          minWriteAccess: 0,
          subheaders: []
        })

      cursor = cursor[ind].subheaders
    }

    cursor.push( this.GenerateSchemaField(FieldObj, lastName) )
  }

  GenerateSchemaField(FieldObj, FieldKey ) {
    let field = {
      key: FieldKey,
      isArray: FieldObj.instance == 'Array',
      type: FieldObj.instance,
      required: FieldObj.options.required || false,
      ref: FieldObj.options.ref || null,
      name: FieldObj.options.name || null,
      description: FieldObj.options.description || null,
      default: FieldObj.options.default || null,
      minReadAccess: FieldObj.options.minReadAccess || 0,
      minWriteAccess: FieldObj.options.minWriteAccess || 0,
    }
    if(FieldObj.options.primary) field.primary = true
    if(FieldObj.options.hidden) field.hidden = true

    if(field.isArray) {
      const Emb = FieldObj.$embeddedSchemaType

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
      field.type = 'Object',
      field.subheaders = []
    }
    else if(field.type == 'Mixed') {
      field.type = 'Object'
      console.log('\x1b[36m%s\x1b[0m', `
CRUDENGINE WARNING:
Fields with mixed type can not be traced, due to limitation!
To get subheaders use the following syntax:
field: {
  type: new Schema({subfield: String})
}
Instead of:
field: {
  type: {subfield: String}
}
      `)
    }

    if(field.ref) {
      let ref = field.ref
      field.DBString = typeof ref == 'function' ? ref.db._connectionString : this.BaseDBString
      field.ref = typeof ref == 'function' ? ref.modelName : ref
      
      if(field.DBString != this.BaseDBString) {
        if(!this.Schemas[field.DBString]) this.Schemas[field.DBString] = {}
        this.Schemas[field.DBString][field.ref] = this.GenerateSchema(ref)
      }
    }

    return field
  }

  plugInFieldRef(FieldObj) {
    if(!FieldObj.ref && !FieldObj.subheaders) return

    if(FieldObj.ref){
      if(FieldObj.ref == 'CRUDFile') return FieldObj.subheaders = this.CRUDFileShema

      if(this.Schemas[FieldObj.DBString][FieldObj.ref]) return FieldObj.subheaders = this.Schemas[FieldObj.DBString][FieldObj.ref]
    }

    for(const FObj of FieldObj.subheaders)
      this.plugInFieldRef(FObj)
  }

  GetCorrectType(item) {
    switch(item.type) {
      case 'Number':  return 'float'
      case 'String':  return 'string'
      case 'Date':    return 'string'
      case 'Boolean': return 'bool'
      case 'ObjectID':
        if(item.ref) return item.ref
        else return 'string'
      default: return null
    }
  }

  GetDeclinedPaths(accesslevel = 300, model, authField = 'minReadAccess', excludeSubKeys = false) {
    return Object.entries(this.PathSchemas[model])
            .filter(([key, field]) => (!excludeSubKeys || !key.includes('.')) && field[authField] > accesslevel)
            .map(entr => entr[0])
  }

  RemoveDeclinedFields(accesslevel, schema, array, authField = 'minReadAccess') {
    for(const object of array) this.RemoveDeclinedFieldsFromObject(accesslevel, this.Schemas[this.BaseDBString][schema], object, authField)

    return array
  }

  RemoveDeclinedFieldsFromObject(accesslevel, fields, object, authField = 'minReadAccess') {
    for(let field of fields) {
      if(field[authField] > accesslevel) delete object[field.key]
      else if(field.subheaders && object[field.key]) {
        if(field.isArray) object[field.key].some( obj => this.RemoveDeclinedFieldsFromObject(accesslevel, field.subheaders, obj, authField) )
        this.RemoveDeclinedFieldsFromObject(accesslevel, field.subheaders, object[field.key], authField)
      }
    }
  }

  GetHeaders(model, depth = 0) {
    if(typeof model == 'string') model = this.Schemas[this.BaseDBString][model]
    let headers = []

    for( let field of model ) {
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

    // Generate the crud routes for each model
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
          this.RemoveDeclinedFields(req.accesslevel, req.params.model, results)
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
          this.RemoveDeclinedFields(req.accesslevel, req.params.model, results)
          if( MFunctions.after && (await eval(MFunctions.after)) == true ) return
          res.send(results)
        })
        .catch( error => res.status(500).send(error) )
    })

    Router.post( '/search/:model', async (req, res) => {
      const MFunctions = this.Middlewares[req.params.model].R
      if( MFunctions.before && (await eval(MFunctions.before)) == true ) return
      
      this.MongooseConnection.model(req.params.model).find(req.body.filter || {})
      .lean({ autopopulate: true, virtuals: true, getters: true })
      .then( async allData => {
        this.RemoveDeclinedFields(req.accesslevel, req.params.model, allData)
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
      this.MongooseConnection.model(req.params.model).findOne( { _id: req.params.id }, req.query.projection, async (error, results) => {
        if(error) return res.status(500).send(error)
        this.RemoveDeclinedFieldsFromObject(req.accesslevel, this.Schemas[this.BaseDBString][req.params.model], results)
        if( MFunctions.after && (await eval(MFunctions.after)) == true ) return
        res.send(results)
      }).lean({ autopopulate: true, virtuals: true, getters: true })
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
        CRUDFile.create(fileData, (err, file) => {
          if(err) res.status(500).send(err)
          else res.send(file)
        })
      })

      // TODO
      Router.delete( "/filedelete/:id", (req, res) => {
        CRUDFile.findOne({_id: req.params.id})
          .then( file => {
            let realPath = path.resolve( this.FileDIR, file.path )
            if(realPath.indexOf(this.FileDIR) != 0) return res.status(500).send('Invalid file path!')

            fs.unlinkSync(realPath)
            let thumbnailPath = realPath.replace('.', '_thumbnail.')
            if(fs.existsSync(thumbnailPath)) fs.unlinkSync(thumbnailPath)

            CRUDFile.deleteOne({_id: file._id})
              .then( () => res.send() )
              .catch( err => res.status(500).send(err) )
          })
          .catch( err => res.status(500).send(err) )
      })
    }

    Router.post( "/:model", async (req, res) => {
      const MFunctions = this.Middlewares[req.params.model].C
      this.RemoveDeclinedFieldsFromObject(req.accesslevel, this.Schemas[this.BaseDBString][req.params.model], req.body, 'minWriteAccess')
      if( MFunctions.before && (await eval(MFunctions.before)) == true ) return
      const Mod = this.MongooseConnection.model(req.params.model)
      const results = new Mod(req.body)
      results.save( async (error, results) => {
        if(error) return res.status(500).send(error)
        if( MFunctions.after && (await eval(MFunctions.after)) == true ) return
        res.send(results)
      })
    })

    Router.patch( "/:model", async (req, res) => {
      const MFunctions = this.Middlewares[req.params.model].U
      this.RemoveDeclinedFieldsFromObject(req.accesslevel, this.Schemas[this.BaseDBString][req.params.model], req.body, 'minWriteAccess')

      if( MFunctions.before && (await eval(MFunctions.before)) == true ) return
      this.MongooseConnection.model(req.params.model).updateOne({ _id: req.body._id }, req.body, async (error, results) => {
        if(error) return res.status(500).send(error)
        if( MFunctions.after && (await eval(MFunctions.after)) == true ) return
        res.send(results)
      })
    })

    Router.delete( "/:model/:id", async (req, res) => {
      const MFunctions = this.Middlewares[req.params.model].D
      const declinedPaths = this.GetDeclinedPaths(req.accesslevel, req.params.model, 'minWriteAccess', true)
      if(declinedPaths.length) return res.status(500).send('EPERM')

      if( MFunctions.before && (await eval(MFunctions.before)) == true ) return
      this.MongooseConnection.model(req.params.model).deleteOne({ _id: req.params.id }, async (error, results) => {
        if(error) return res.status(500).send(error)
        if( MFunctions.after && (await eval(MFunctions.after)) == true ) return
        res.send(results)
      })
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

          CRUDFile.create(fileData, (err, file) => {
            if(err) res.status(500).send(err)
            else res.send(file)
          })
        })
      }

      fs.unlinkSync(file.path)

      CRUDFile.create(fileData, (err, file) => {
        if(err) res.status(500).send(err)
        else res.send(file)
      })
    })
  }

  addMiddleware( modelname, operation, timing, middlewareFunction ) {
    return new Promise( (resolve, reject) => {
      if( !this.Middlewares[modelname] ) return reject( new Error(`Middleware: No model found with name: ${modelname}`) )
      if( !this.Operations.includes(operation) ) return reject( new Error(`Middleware: Operation should be one of: ${this.Operations}`) )
      if( !this.Timings.includes(timing) ) return reject( new Error(`Middleware: Timing should be one of: ${this.Timings}`) )

      this.Middlewares[modelname][operation][timing] = `(${middlewareFunction.toString()})()`
      return resolve('Middleware added')
    })
  }
}

module.exports = CrudEngine
