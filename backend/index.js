const express       = require('express')
const mongoose      = require('mongoose')
const fs            = require('fs')
const path          = require('path')
const { load }      = require('protobufjs')
const multer        = require('multer')
const sharp         = require('sharp')
const CRUDFile      = require('./schemas/CRUDFile')

const Router = express.Router()

class CrudEngine {

  constructor({SchemaDIR, ServiceDIR = null, FileDIR = null, ImageHeightSize = 800, Thumbnail = false, ThumbnailSize = 250, MaxHeaderDepth = 2, ServeStaticPath = '/static'}) {
    this.Schema           = {}
    this.Services         = {}
    this.Middlewares      = {}
    this.Operations       = ['C', 'R', 'U', 'D']
    this.Timings          = ['after', 'before']
    this.ImageHeightSize  = ImageHeightSize
    this.Thumbnail        = Thumbnail
    this.ThumbnailSize    = ThumbnailSize
    this.FileDIR          = FileDIR
    this.SchemaDIR        = SchemaDIR
    this.ServiceDIR       = ServiceDIR
    this.API              = false
    this.MaxHeaderDepth   = MaxHeaderDepth
    this.ServeStaticPath  = ServeStaticPath

    if (FileDIR) {
      if(!fs.existsSync(FileDIR))
        fs.mkdirSync(path.resolve(FileDIR), { recursive: true })

      this.upload = multer({ dest: FileDIR })
    }

    if( ServiceDIR ) {
      const ServiceFileArray = fs.readdirSync( ServiceDIR )
      for( const ServiceFile of ServiceFileArray ) {
        if( ServiceFile == '.DS_Store' || ServiceFile.includes('.map') ) continue

        const ServiceName = ServiceFile
        .replace( '.js', '' )
        .replace( '.ts', '' )
        .replace( '.coffee', '' )

        this.Services[ServiceName] = require(`${ServiceDIR}/${ServiceFile}`)
      }
    }

    let rawSchemas = {}

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

    this.GenerateSchemas(rawSchemas)
    this.GenerateProto()

    load( path.resolve(__dirname, './api.proto'), (error, api) => {
      if(!error) this.API = api
    })
  }

  GenerateSchemas(RawSchemas) {
    for(let modelName in RawSchemas) {
      const CurrSchema = RawSchemas[modelName].schema
      const Paths = this.GetPaths(CurrSchema)
      let fields = []

      for(const FieldPath in Paths)
        this.GenerateObjFieldChain(Paths[FieldPath], FieldPath, fields)

      this.Schema[modelName] = fields
    }

    for(let modelName in this.Schema) {
      for(const FieldObj of this.Schema[modelName])
      this.plugInFieldRef(FieldObj)
    }
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
    let FieldNames = FieldPath.split('.')
    let lastName = FieldNames[FieldNames.length-1]

    if( ['_id', '__v', '$'].some(s => lastName == s) ) return

    for( let FieldName of FieldNames.slice(0, FieldNames.length-1) ) {
      let ind = 0
      while( ind < cursor.length && cursor[ind].name != FieldName ) ind++

      if(ind == cursor.length)
        cursor.push({
          name: FieldName,
          isArray: false,
          type: 'Object',
          required: false,
          ref:  null,
          alias: FieldName,
          description: null,
          default: null,
          minReadAuth: 300,
          minWriteAuth: 300,
          subheaders: []
        })

      cursor = cursor[ind].subheaders
    }

    cursor.push( this.GenerateSchemaField(FieldObj, lastName) )
  }

  GenerateSchemaField(FieldObj, FieldName ) {
    let field = {
      name: FieldName,
      isArray: FieldObj.instance == 'Array',
      type: FieldObj.instance,
      required: FieldObj.options.required || false,
      ref: FieldObj.options.ref || null,
      alias: FieldObj.options.alias || null,
      description: FieldObj.options.description || null,
      default: FieldObj.options.default || null,
      minReadAuth: FieldObj.options.minReadAuth || 300,
      minWriteAuth: FieldObj.options.minWriteAuth || 300,
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
      field.alias = field.alias || Emb.options.alias || null
      field.description = field.description || Emb.options.description || null
      field.default = field.default || Emb.options.default || null
      field.minReadAuth = Math.min(field.minReadAuth, (Emb.options.minReadAuth || 300))
      field.minWriteAuth = Math.min(field.minWriteAuth, (Emb.options.minWriteAuth || 300))
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

    return field
  }

  plugInFieldRef(FieldObj) {
    if(!FieldObj.ref && !FieldObj.subheaders) return

    if(FieldObj.ref && this.Schema[FieldObj.ref]) return FieldObj.subheaders = this.Schema[FieldObj.ref]
    if(FieldObj.ref == 'CRUDFile') FieldObj.subheaders = []

    for(const FObj of FieldObj.subheaders)
      this.plugInFieldRef(FObj)
  }

  GenerateProto() {
    let proto = "package api;\nsyntax = \"proto3\";\n\n"

    for( const ModelName in this.Schema ) {
      proto += `message ${ModelName} {\n`
      let id = 1

      for( let item of this.Schema[ModelName] ) {
        let type = this.GetCorrectType( item )
        if(type == null)continue

        if(item.isArray) proto += `\trepeated ${type} ${item.name} = ${id};\n`
        else proto += `\t${type} ${item.name} = ${id};\n`
        id++
      }
      proto += "}\n"

      proto += `message ${ModelName}s {\n\trepeated ${ModelName} ${ModelName}s = 1;\n}\n\n`
    }

    fs.writeFileSync( path.resolve(__dirname, './api.proto'), proto, {flag: "w+"} )
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

  GetDeclinedReadFields(accesslevel = 300, model) {
    return new Promise( (resolve, reject) =>
      resolve (
        this.Schema[model]
          .filter( field => field.minReadAuth != undefined && field.minReadAuth < accesslevel)
          .map( one => one.name)
      )
    )
  }

  GetDeclinedWriteFields(accesslevel = 300, model) {
    return new Promise( (resolve, reject) => {
      let declinedFields = this.Schema[model].filter( field => field.minWriteAuth != undefined && field.minWriteAuth < accesslevel )
      if( declinedFields.filter(one => one.required).length ) return resolve(null)
      resolve( declinedFields.map(one => one.name) )
    })
  }

  async GetProjection(accesslevel, model, fields = [], include = true) {
    let projection = {}
    if(!fields.length) include = false

    if(include) this.Schema[model].forEach( one => {
      if( !fields.includes(one.name) ) projection[one.name] = 0
    })
    else { fields.forEach( one => projection[one] = 0 ) }

    (await this.GetDeclinedReadFields(accesslevel, model)).map( one => projection[one] = 0 )

    if( !Object.keys(projection).length ) return { __v: 0 }
    else return projection
  }

  GetHeaders( model, depth = 0 ) {
    if(typeof model == 'string') model = this.Schema[model]
    let headers = []

    for( let field of model ) {
      if(field.hidden) continue
      let hField = {}

      for(let key of ['alias', 'name', 'description', 'type', 'isArray', 'primary'])
        hField[key] = field[key]

      hField.key = hField.name
      hField.name = hField.alias
      delete hField.alias

      if(field.subheaders && depth < this.MaxHeaderDepth)
        hField.subheaders = this.GetHeaders(field.subheaders, field.ref ? depth+1 : depth)

      headers.push(hField)
    }

    return headers
  }

  GenerateRoutes() {
    Router.use( '/protofile', express.static(path.resolve(__dirname, './api.proto')) )

    Router.get( '/schema', (req, res) => res.send(this.Schema) )

    Router.get( '/schema/:model', (req, res) => res.send(this.Schema[req.params.model]) )

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

    Router.get( '/proto/:model', async (req, res) => {
      if(!req.query.filter) req.query.filter = "{}"
      if(!req.query.sort) req.query.sort = "{}"

      const MFunctions = this.Middlewares[req.params.model].R
      const projection = await this.GetProjection( req.accesslevel, req.params.model, req.query.projection )

      if( MFunctions.before && (await eval(MFunctions.before)) == true ) return
      mongoose.model(req.params.model).find( JSON.parse(req.query.filter), projection )
        .sort( JSON.parse(req.query.sort) )
        .skip( Number(req.query.skip) || 0 )
        .limit( Number(req.query.limit) || null )
        .then( async results => {
          if( MFunctions.after && (await eval(MFunctions.after)) == true ) return

          const ProtoType = this.API.lookupType(`api.${req.params.model}s`)
          const message = ProtoType.fromObject({ [`${req.params.model}s`]: results })
          const buffer = ProtoType.encode(message).finish()

          res.send(buffer)
        })
        .catch( error => res.status(500).send(error) )
    })

    Router.get( '/tableheaders/:model', (req, res) => res.send(this.GetHeaders(req.params.model)) )

    Router.get( '/table/:model', async (req, res) => {
      if(!req.query.filter) req.query.filter = "{}"
      if(!req.query.sort) req.query.sort = "{}"

      const Headers = this.GetHeaders(req.params.model)
      const MFunctions = this.Middlewares[req.params.model].R
      const projection = await this.GetProjection( req.accesslevel, req.params.model, req.query.projection )

      if( MFunctions.before && (await eval(MFunctions.before)) == true ) return
      mongoose.model(req.params.model).find( JSON.parse(req.query.filter), projection )
        .sort( JSON.parse(req.query.sort) )
        .skip( Number(req.query.skip) || 0 )
        .limit( Number(req.query.limit) || null )
        .then( async results => {
          if( MFunctions.after && (await eval(MFunctions.after)) == true ) return
          res.send({ Headers, Data: results })
        })
        .catch( error => res.status(500).send(error) )
    })

    Router.get( '/:model/find', async (req, res) => {
      if(!req.query.filter) req.query.filter = "{}"
      if(!req.query.sort) req.query.sort = "{}"

      const MFunctions = this.Middlewares[req.params.model].R
      const projection = await this.GetProjection( req.accesslevel, req.params.model, req.query.projection )

      if( MFunctions.before && (await eval(MFunctions.before)) == true ) return
      mongoose.model(req.params.model).find( JSON.parse(req.query.filter), projection )
        .sort( JSON.parse(req.query.sort) )
        .skip( Number(req.query.skip) || 0 )
        .limit( Number(req.query.limit) || null )
        .then( async results => {
          if( MFunctions.after && (await eval(MFunctions.after)) == true ) return
          res.send(results)
        })
        .catch( error => res.status(500).send(error) )
    })

    Router.get( "/:model/:id", async (req, res) => {
      const MFunctions = this.Middlewares[req.params.model].R
      const projection = await this.GetProjection( req.accesslevel, req.params.model, req.query.projection )

      if( MFunctions.before && (await eval(MFunctions.before)) == true ) return
      mongoose.model(req.params.model).findOne( { _id: req.params.id }, projection, async (error, results) => {
        if(error) return res.status(500).send(error)
        if( MFunctions.after && (await eval(MFunctions.after)) == true ) return
        res.send(results)
      })
    })

    if(this.FileDIR) {
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
      const declinedFields = await this.GetDeclinedWriteFields( req.accesslevel, req.params.model )

      if(declinedFields == null) return res.status(500).send('EPERM')
      declinedFields.forEach( one => delete req.body[one] )

      if( MFunctions.before && (await eval(MFunctions.before)) == true ) return
      const Mod = mongoose.model(req.params.model)
      const results = new Mod(req.body)
      results.save( async (error, results) => {
        if(error) return res.status(500).send(error)
        if( MFunctions.after && (await eval(MFunctions.after)) == true ) return
        res.send(results)
      })
    })

    Router.patch( "/:model", async (req, res) => {
      const MFunctions = this.Middlewares[req.params.model].U
      const declinedFields = await this.GetDeclinedWriteFields( req.accesslevel, req.params.model )

      if(declinedFields == null) return res.status(500).send('EPERM')
      declinedFields.forEach( one => delete req.body[one] )

      if( MFunctions.before && (await eval(MFunctions.before)) == true ) return
      mongoose.model(req.params.model).updateOne({ _id: req.body._id }, req.body, async (error, results) => {
        if(error) return res.status(500).send(error)
        if( MFunctions.after && (await eval(MFunctions.after)) == true ) return
        res.send(results)
      })
    })

    Router.delete( "/:model/:id", async (req, res) => {
      const MFunctions = this.Middlewares[req.params.model].D
      const declinedFields = await this.GetDeclinedWriteFields( req.accesslevel, req.params.model )

      if( declinedFields == null || declinedFields.length ) return res.status(500).send('EPERM')

      if( MFunctions.before && (await eval(MFunctions.before)) == true ) return
      mongoose.model(req.params.model).deleteOne({ _id: req.params.id }, async (error, results) => {
        if(error) return res.status(500).send(error)
        if( MFunctions.after && (await eval(MFunctions.after)) == true ) return
        res.send(results)
      })
    })

    return Router
  }

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
      if( !this.Middlewares[modelname] ) return reject( new Error(`No model found with name: ${modelname}`) )
      if( !this.Operations.includes(operation) ) return reject( new Error(`Operation should be one of: ${this.Operations}`) )
      if( !this.Timings.includes(timing) ) return reject( new Error(`Timing should be one of: ${this.Timings}`) )

      this.Middlewares[modelname][operation][timing] = `(${middlewareFunction.toString()})()`
      return resolve('Middleware added')
    })
  }
}

module.exports = CrudEngine
