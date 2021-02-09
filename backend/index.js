const express       = require('express')
const multer        = require('multer')
const sharp         = require('sharp')
const Fuse          = require('fuse.js')
const path          = require('path')
const fs            = require('fs')
const CRUDFileModel = require('./schemas/CRUDFile')

const Router = express.Router()

class CrudEngine {
  constructor({
      MongooseConnection = require('mongoose'),
      SchemaDir,
      ServiceDir = null,
      FileDir = null,
      ServeStaticPath = '/static',
      MaxImageSize = 800,
      CreateThumbnail = false,
      MaxThumbnailSize = 200,
      CheckAccess = true,
      MaxHeaderDepth = 2,
      ShowLogs = true,
      ShowWarnings = true,
      ShowErrors = true,
    }) {
    this.MongooseConnection   = MongooseConnection
    this.BaseDBString         = MongooseConnection.connections[0]._connectionString
    this.Schemas              = {[this.BaseDBString]: {}}
    this.PathSchemas          = {}
    this.DecycledSchemas      = {}
    this.CRUDFileShema        = []
    this.Services             = {}
    this.Middlewares          = {}
    this.Operations           = ['C', 'R', 'U', 'D']
    this.Timings              = ['after', 'before']
    this.SchemaDir            = SchemaDir
    this.ServiceDir           = ServiceDir
    this.FileDir              = FileDir
    this.ServeStaticPath      = ServeStaticPath
    this.MaxImageSize         = MaxImageSize
    this.CreateThumbnail      = CreateThumbnail
    this.MaxThumbnailSize     = MaxThumbnailSize
    this.CheckAccess          = CheckAccess
    this.MaxHeaderDepth       = MaxHeaderDepth
    this.ShowLogs             = ShowLogs
    this.ShowWarnings         = ShowWarnings
    this.ShowErrors           = ShowErrors
    this.upload               = null

    this.LogBreakingChanges()

    if(FileDir)
      this.upload = multer({dest: FileDir}) // multer will handle the saving of files, when one is uploaded

    // Imports every .js file from "ServiceDir" into the "Services" object
    if(ServiceDir) {
      for( const ServiceFile of fs.readdirSync(ServiceDir) ) {
        if( !ServiceFile.endsWith('.js') ) continue
        
        const ServiceName = ServiceFile.replace( '.js', '' )
        
        this.Services[ServiceName] = require(`${ServiceDir}/${ServiceFile}`)
      }
    }

    this.CRUDFileShema = this.GenerateSchema(CRUDFileModel)
    this.GenerateSchemas()
    this.GenerateDecycledSchemas()
    this.GeneratePathSchemas()
  }

  
  /**
   * Imports every model from "SchemaDir" and creates a crudengine schema for it.
   * Also creates default middlewares for them.
   * Finally it handles the references between the schemas.
   */
  GenerateSchemas() {
    for( let schemaFile of fs.readdirSync(this.SchemaDir) ) {
      if( !schemaFile.endsWith('.js') ) continue

      let model = require(`${this.SchemaDir}/${schemaFile}`)
      let modelName = model.modelName || model.default.modelName

      this.Schemas[this.BaseDBString][modelName] = this.GenerateSchema(model)
      this.Middlewares[modelName] = {
        C: { before: () => Promise.resolve(), after: () => Promise.resolve()},
        R: { before: () => Promise.resolve(), after: () => Promise.resolve()},
        U: { before: () => Promise.resolve(), after: () => Promise.resolve()},
        D: { before: () => Promise.resolve(), after: () => Promise.resolve()},
      }
    }

    // Now every schema is ready, we can ref them in each other
    for(let DBString in this.Schemas)
      for(let modelName in this.Schemas[DBString])
        for(let field of this.Schemas[DBString][modelName])
          this.plugInFieldRef(field)
  }

  /**
   * Creates a crudengine schema for a specific model.
   * @param {Object} model - A mongoose model
   */
  GenerateSchema(model) {
    const Paths = this.GetPaths(model.schema)
    let fields = []

    for(const FieldPath in Paths)
      this.GenerateObjFieldTree(fields, FieldPath, Paths[FieldPath])

    return fields
  }

  /**
   * Removes circular references from the schemas and saves this copy of them.
   * Theese are the schema types, that can be turned into JSON when needed.
   */
  GenerateDecycledSchemas() {
    for(let modelName in this.Schemas[this.BaseDBString]) {
      const DecycledSchema = this.CopySubheaders({subfields: this.Schemas[this.BaseDBString][modelName]}) // We copy the top level of fields
      this.DecycledSchemas[modelName] = DecycledSchema.subfields // Theese new fields will be the top level of the decycled schema
      
      for(let field of this.DecycledSchemas[modelName])
        this.DecycleField(field)
    }
  }

  /**
   * Recursively copies the given fields and their subfields, until circular reference is detected
   * @param {Object} field - A crudengine field descriptor
   * @param {Array} [refs=[]] - This parameter should be leaved empty
   */
  DecycleField(field, refs = []) {
    if(!field.subfields) return

    let refId = `${field.DBString}:${field.ref}`
    if(refs.includes(refId)) return field.subfields = [] // if a ref was already present once in one of the parent fields, we stop
    if(field.ref) refs.push(refId) // we collect the refs of the fields that we once saw

    this.CopySubheaders(field)

    for(let f of field.subfields) // do the same process for every child field passing along the collected refs
      this.DecycleField(f, [...refs])
  }

  /**
   * Copies one level of the subfields of the given field descriptor
   * @param {Object} field - A crudengine field descriptor
   */
  CopySubheaders(field) {
    field.subfields = [...field.subfields] // copying the subfields array
    
    for(let i=0; i<field.subfields.length; ++i)
      field.subfields[i] = {...field.subfields[i]} // copying the descriptor object of the subfields

    return field
  }

  /**
   * Generates a PathSchema descriptor for every schema handled by crudengine
   */
  GeneratePathSchemas() {
    for(let modelName in this.DecycledSchemas) {
      this.PathSchemas[modelName] = {}
  
      for(let field of this.DecycledSchemas[modelName])
        this.GeneratePathSchema(field, this.PathSchemas[modelName])
    }
  }
  
  /**
   * Recursively generates <FieldPath, Field> entries for the field given and its subfields.
   * @param {Object} field - A crudengine field descriptor
   * @param {Object} acc - Generated entries will be stored in this object
   * @param {String} [prefix] - This parameter should be leaved empty
   */
  GeneratePathSchema(field, acc, prefix = '') {
    acc[`${prefix}${field.key}`] = field
    
    if(field.subfields)
      for(let f of field.subfields)
        this.GeneratePathSchema(f, acc, `${prefix}${field.key}.`)
  }

  /**
   * Returns the field paths of a model that are safe to be used with fuse.js.
   * @param {String} modelName 
   * @param {Number} maxDepth 
   */
  GetSchemaKeys(modelName, maxDepth = this.MaxHeaderDepth) {
    let keys = []

    for(let field of this.DecycledSchemas[modelName])
      this.GenerateSchemaKeys(field, keys, maxDepth)

    let keys
  }

  /**
   * Recursively collects the field paths of a field and its subfields that are safe to be used with fuse.js.
   * @param {Object} field - A crudengine field descriptor
   * @param {Array} keys - Keys will be collected in this array
   * @param {*} maxDepth
   * @param {*} [prefix] - This parameter should be leaved empty
   * @param {*} [depth] - This parameter should be leaved empty
   */
  GenerateSchemaKeys(field, keys, maxDepth, prefix = '', depth = 0) {
    if(depth > maxDepth) return

    if(!['Object', 'Date'].some(t => field.type == t) && !field.subfields) // fuse.js can not handle values that are not strings or numbers, so we don't collect those keys.
      keys.push(`${prefix}${field.key}`)
    
    if(field.subfields)
      for(let f of field.subfields)
        this.GenerateSchemaKeys(f, keys, maxDepth, `${prefix}${field.key}.`, depth+1)
  }

  /**
   * Recursively creates an object with entries of field path and mongoose field descriptors
   * @param {Object} schema - A mongoose schema
   * @param {Obejct} [acc] - This parameter should be leaved empty
   * @param {String} [prefix] - This parameter should be leaved empty
   */
  GetPaths(schema, acc = {}, prefix = '') {
    let joinedPaths = {...schema.paths, ...schema.subpaths} // both paths and subpaths can store fields of the schema

    for(let key in joinedPaths) {
      let field = joinedPaths[key]
      let prefixedKey = prefix + key

      acc[prefixedKey] = field

      if(field.schema)
        this.GetPaths(field.schema, acc, `${prefixedKey}.`)
    }

    return acc
  }

  /**
   * Takes the fieldPath given and step by step creates crudengine field descriptors for them.
   * @param {Array} currentFieldLevel - Created field descriptors will be collected in this
   * @param {String} fieldPath - The "." separated path of the field in the mongoose schema
   * @param {Object} fieldDescriptor - The mongoose descriptor of the field
   */
  GenerateObjFieldTree(currentFieldLevel, fieldPath, fieldDescriptor) {
    let fieldKeys = fieldPath.split('.') // we have no information of the fields with theese keys, other then that they are Objects containign the field of the next step and possibly others
    let lastKey = fieldKeys.pop() // this is the field that we have information about from mongoose

    if( ['_id', '__v', '$'].some(s => lastKey == s) ) return // theese fields are not handled by crudengine

    for(const fieldKey of fieldKeys) {
      // first we search for an already created field descriptor that is on the same level as the key
      let ind = 0
      while( ind < currentFieldLevel.length && currentFieldLevel[ind].key != fieldKey ) ind++

      // if we went through the whole level and found no descriptor, we create one
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
          subfields: []
        })

      // we go one level deeper for the next key
      currentFieldLevel = currentFieldLevel[ind].subfields
    }
    // when every parent descriptor is created, we create the one we have information about from mongoose
    currentFieldLevel.push( this.GenerateSchemaField(lastKey, fieldDescriptor) )
  }

  /**
   * Creates a crudengine field descriptor from a mongoose one.
   * @param {String} fieldKey 
   * @param {Object} fieldDescriptor - A mongoose field descriptor
   */
  GenerateSchemaField(fieldKey, fieldDescriptor) {
    // we basically collect the information we know about the field
    let field = {
      key: fieldKey,
      isArray: fieldDescriptor.instance == 'Array',
      type: fieldDescriptor.instance,
      required: fieldDescriptor.options.required || false,
      ref: fieldDescriptor.options.ref || null,
      name: fieldDescriptor.options.name || null,
      description: fieldDescriptor.options.description || null,
      default: fieldDescriptor.options.default || null,
      minReadAccess: fieldDescriptor.options.minReadAccess || 0,
      minWriteAccess: fieldDescriptor.options.minWriteAccess || 0,
    }
    if(fieldDescriptor.options.primary) field.primary = true
    if(fieldDescriptor.options.hidden) field.hidden = true

    if(field.isArray) {
      const Emb = fieldDescriptor.$embeddedSchemaType

      if(!Emb.instance) field.subfields = []
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
      field.subfields = []
    }
    else if(field.type == 'Mixed') {
      field.type = 'Object'
      this.LogMixedType(fieldKey, field.name)  
    }

    // if the field has a ref, we check if it is a string or a model
    if(field.ref) {
      let givenRef = field.ref
      let isModel = typeof givenRef == 'function'

      field.DBString = isModel ? givenRef.db._connectionString : this.BaseDBString // we need to know which connection the ref model is from
      field.ref = isModel ? givenRef.modelName : givenRef
      
      // if the model is form another connection, we generate a schema descriptor for it, so we can later use it as ref
      if(field.DBString != this.BaseDBString) {
        if(!this.Schemas[field.DBString]) this.Schemas[field.DBString] = {}
        this.Schemas[field.DBString][field.ref] = this.GenerateSchema(givenRef)
      }
    }

    return field
  }

  /**
   * Recursively plugs in the references of the given field and its subfields.
   * @param {Object} field - A crudengine field descriptor
   */
  plugInFieldRef(field) {
    if(!field.ref && !field.subfields) return

    if(field.ref) {
      if(field.ref == 'CRUDFile') return field.subfields = this.CRUDFileShema // CRUDfile is not stored in the "Schemas" object as it comes from this library not the user.
      if(this.Schemas[field.DBString][field.ref]) return field.subfields = this.Schemas[field.DBString][field.ref] // If the ref is known as a schema, then the fields new subheaders are the fields of that schema
    }

    for(const fObj of field.subfields)
      this.plugInFieldRef(fObj)
  }

  /**
   * Collects the fields of a model, which need a higher accesslevel, then given as parameter.
   * @param {String} modelName 
   * @param {Number} [accesslevel=0]
   * @param {String} [authField='minReadAccess'] - Either 'minReadAccess' or 'minWriteAccess'
   * @param {Boolean} [excludeSubKeys=false] - Indicates whether or not only top level fields should be checked
   */
  GetDeclinedPaths(modelName, accesslevel = 0, authField = 'minReadAccess', excludeSubKeys = false) {
      let fieldEntries = Object.entries(this.PathSchemas[modelName])

      if(excludeSubKeys) fieldEntries = fieldEntries.filter( ([key, field]) => !key.includes('.') )
      fieldEntries = fieldEntries.filter( ([key, field]) => field[authField] > accesslevel )
      
      return fieldEntries.map(entr => entr[0])
  }

  /**
   * Removes every field from an array of documents, which need a  higher accesslevel, then given as parameter.
   * @param {String} modelName 
   * @param {Array} documents 
   * @param {Number} [accesslevel=0] 
   * @param {String} [authField='minReadAccess'] 
   */
  RemoveDeclinedFields(modelName, documents, accesslevel = 0, authField = 'minReadAccess') {
    for(const document of documents)
      this.RemoveDeclinedFieldsFromObject(this.Schemas[this.BaseDBString][modelName], document, accesslevel, authField)

    return documents
  }

  /**
   * Removes every field from an object, which need a higher accesslevel, then given as parameter.
   * @param {Array} fields - A crudengine schema descriptor
   * @param {*} object - The object to remove from
   * @param {*} [accesslevel=0]  
   * @param {*} [authField='minReadAccess']  
   */
  RemoveDeclinedFieldsFromObject(fields, object, accesslevel = 0, authField = 'minReadAccess') {
    for(let field of fields) {
      if(field[authField] > accesslevel) delete object[field.key]

      else if(field.subfields && object[field.key]) {
        if(field.isArray) object[field.key].forEach( obj => this.RemoveDeclinedFieldsFromObject(field.subfields, obj, accesslevel, authField) )
        else this.RemoveDeclinedFieldsFromObject(field.subfields, object[field.key], accesslevel, authField)
      }
    }
  }

  /**
   * Recursively creates field descriptors that only have those information, which can be useful on the frontend
   * @param {(String|Array)} schema - Model name, or crudengine schema descriptor 
   * @param {Number} [depth=0] - This parameter should be leaved empty
   */
  GetHeaders(schema, depth = 0) {
    if(typeof schema == 'string') schema = this.Schemas[this.BaseDBString][schema] // if string was given, we get the schema descriptor
    let headers = []

    for(let field of schema) {
      if(field.hidden) continue // fields marked as hidden should not be visible as (table)headers
      let hField = {}

      for(let key of ['name', 'key', 'description', 'type', 'isArray', 'primary']) // we copy theese fields as they are useful on the frontend
        hField[key] = field[key]

      // if current depth is lower then max, we collect the headers of the subfields and name them subheaders
      if(field.subfields && depth < this.MaxHeaderDepth)
        hField.subheaders = this.GetHeaders(field.subfields, field.ref ? depth+1 : depth)

      headers.push(hField)
    }

    return headers
  }

  /**
   * Helper function, that is used when an image was uploaded.
   * It will resize the image if needed to the specified size.
   * It will create a CRUDFile document for the image, with the properties of the image.
   * It will also create a thumbnail of the image if needed.
   * @param {Object} req 
   * @param {Object} res 
   */
  handleImageUpload(req, res) {
    let multerPath    = req.file.path
    let extension     = req.file.originalname.split('.').pop()
    let filePath      = `${req.file.filename}.${extension}` // the image will be saved with the extension attached

    this.resizeImageTo(multerPath, this.MaxImageSize, `${multerPath}.${extension}`) // resizes and copies the image
      .then( () => {
        if(this.CreateThumbnail) //if a thumbnail is needed create one
          return this.resizeImageTo(multerPath, this.MaxThumbnailSize, `${multerPath}_thumbnail.${extension}`)
      })
      .then( () => fs.promises.unlink(multerPath) ) // we don't need the original image anymore
      .then( () => CRUDFileModel.create({ // we create the CRUDFile document
        name: req.file.originalname,
        path: filePath,
        size: req.file.size,
        extension: extension,
        isImage: true,
        ...this.CreateThumbnail && {thumbnailPath: `${req.file.filename}_thumbnail.${extension}`} // A hacky way of only append thumbnailPath to an object, when CreateThumbnail is true
      }))
      .then( file => res.send(file) )
      .catch( err => {
        console.error(err)
        res.status(500).send(err)
      })
  }

  /**
   * Resizes an image at the sourcePath to the given size and saves it to the destintaionPath.
   * @param {String} sourcePath 
   * @param {Number} size 
   * @param {String} destinationPath 
   */
  resizeImageTo(sourcePath, size, destinationPath) {
    if(size == null) return fs.promises.copyFile(sourcePath, destinationPath) // if size is null, we do not resize just save it to the destination path
    
    return new Promise( (resolve, reject) => {
      sharp(sourcePath)
        .resize(size, size, {
          fit: 'inside',
          withoutEnlargement: true, // if the size was already smaller then specified, we do not enlarge it
        })
        .toFile(destinationPath, (err, info) => {
          if(err) reject(err)
          else resolve(info)
        })
    })
  }

  /**
   * Adds a middleware function to the given model.
   * @param {String} modelName 
   * @param {String} operation 
   * @param {String} timing 
   * @param {Function} middlewareFunction 
   */
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

  /**
   * A helper function, that is a template for the CRUD routes.
   * @param {Object} req 
   * @param {Object} res 
   * @param {Function} mainPart 
   * @param {Function} responsePart 
   * @param {String} operation 
   */
  CRUDRoute(req, res, mainPart, responsePart, operation) {
    // if the model is unkown send an error
    if(!this.Schemas[this.BaseDBString][req.params.model]) {
      this.LogMissingModel(req.params.model)
      return res.status(500).send('MISSING MODEL')
    }

    // the code below calls the middleware and normal parts of the route and handles their errors correspondingly
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

  /**
   * A helper function, that is a tempalte for Service routes.
   * @param {Obejct} req 
   * @param {Object} res 
   * @param {String} paramsKey 
   */
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

  /**
   * Generates all the routes of crudengine and returns the express router.
   */
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

    if(this.FileDir) {
      Router.use( `${this.ServeStaticPath}`, express.static(path.resolve(__dirname, this.FileDir)) )
      Router.use( `${this.ServeStaticPath}`, (req, res) => res.status(404).send('NOT FOUND') ) // If a file is not found in FileDir, send back 404 NOT FOUND

      // 
      Router.post( "/fileupload", this.upload.single('file'), (req, res) => {
        if(req.file.mimetype.startsWith('image')) return this.handleImageUpload(req, res)

        let multerPath    = req.file.path
        let extension     = req.file.originalname.split('.').pop()
        let filePath      = `${req.file.filename}.${extension}` // the file will be saved with the extension attached

        fs.renameSync(multerPath, `${multerPath}.${extension}`)

        let fileData = {
          name: req.file.originalname,
          path: filePath,
          size: req.file.size,
          extension: extension,
        }

        // we create the CRUDFile document with the properties of the file
        CRUDFileModel.create(fileData, (err, file) => {
          if(err) res.status(500).send(err)
          else res.send(file)
        })
      })

      Router.delete( "/filedelete/:id", (req, res) => {
        CRUDFileModel.findOne({_id: req.params.id})
          .then( file => {
            let realPath = path.resolve(this.FileDir, file.path)
            let thumbnailPath = realPath.replace('.', '_thumbnail.')
            if(!realPath.startsWith(this.FileDir)) return res.status(500).send('INVALID PATH') // for safety, if the resolved path is outside of FileDir we return 500 INVALID PATH

            // we remove both the file and thumbnail if they exists
            if(fs.existsSync(realPath)) fs.unlinkSync(realPath)
            if(fs.existsSync(thumbnailPath)) fs.unlinkSync(thumbnailPath)

            // we delete the CRUDFile document
            return CRUDFileModel.deleteOne({_id: file._id})
          })
          .then( () => res.send() )
          .catch( err => res.status(500).send(err) )
      })
    }

    // Read routes will use "lean" so that results are not immutable
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
        if(this.CheckAccess)
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
        if(this.CheckAccess)
          this.RemoveDeclinedFields(req.params.model, results, req.accesslevel)
        
        if(!req.body.threshold) req.body.threshold = 0.4
        if(!req.body.pattern) return res.send(results)
        if(!req.body.keys || req.body.keys.length == 0) req.body.keys = this.GetSchemaKeys(req.params.model, req.body.depth) // if keys were not given, we search in all keys
  
        const fuse = new Fuse(results, {
          includeScore: false,
          keys: req.body.keys,
          threshold: req.body.threshold
        })
  
        let results = fuse.search(req.body.pattern).map(r => r.item) // fuse.js's results include some other things, then the documents so we need to get them
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
        if(this.CheckAccess)
          this.RemoveDeclinedFieldsFromObject(this.Schemas[this.BaseDBString][req.params.model], result, req.accesslevel)

        res.send(result)
      }

      this.CRUDRoute(req, res, mainPart, responsePart, 'R')
    })

    Router.post( "/:model", async (req, res) => {
      function mainPart(req, res) {
        if(this.CheckAccess)
          this.RemoveDeclinedFieldsFromObject(this.Schemas[this.BaseDBString][req.params.model], req.body, req.accesslevel, 'minWriteAccess')
  
        const Model = this.MongooseConnection.model(req.params.model)
        const ModelInstance = new Model(req.body)
        return ModelInstance.save()
      }

      async function responsePart(req, res, result) {
        if(this.CheckAccess)
          this.RemoveDeclinedFieldsFromObject(this.Schemas[this.BaseDBString][req.params.model], result, req.accesslevel)
  
        res.send(result)
      }

      this.CRUDRoute(req, res, mainPart, responsePart, 'C')
    })

    Router.patch( "/:model", async (req, res) => {
      function mainPart(req, res) {
        if(this.CheckAccess)
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
        if(this.CheckAccess) {
          const declinedPaths = this.GetDeclinedPaths(req.params.model, req.accesslevel, 'minWriteAccess', true)
          if(declinedPaths.length) return Promise.reject('PERMISSION DENIED')
        }
  
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

  // The functions below are the logs of crudengine, they are formatted using bash sequences
  // Colors and formattings can be found at: https://misc.flogisoft.com/bash/tip_colors_and_formatting
  // \e[ should be changed to \x1b[ to work with Node.js
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
To get subfields for this field use the following syntax:
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
