const express      = require('express')
const mongoose     = require('mongoose')
const autopopulate = require('mongoose-autopopulate')
const fs           = require('fs')
const path         = require('path')
const { load }     = require('protobufjs')

const Router = express.Router()

class CrudEngine {
  
  constructor( SchemaDIR, ServiceDIR ) {
    this.Schema = {}
    this.Services = {}
    this.Models = {}
    this.Middlewares = {}
    this.Operations = ['C', 'R', 'U', 'D']
    this.Timings = ['after', 'before']
    this.API = false

    const SchemaFileArray = fs.readdirSync(SchemaDIR)
    if( ServiceDIR ) {
      const ServiceFileArray = fs.readdirSync( ServiceDIR )
      for( const ServiceFile of ServiceFileArray ) {
        if( ServiceFile == '.DS_Store' || ServiceFile.includes('.map') ) continue
        
        const ServiceName = ServiceFile
          .replace( '.js', '' )
          .replace( '.ts', '' )
          .replace( 'coffee', '' )

        this.Services[ServiceName] = require(`${ServiceDIR}/${ServiceFile}`)
      }
    }

    for( const SchemaFile of SchemaFileArray ) {
      if( SchemaFile == '.DS_Store' || SchemaFile.includes('.map') ) continue

      const SchemaName = SchemaFile
        .replace( '.js', '' )
        .replace( '.ts', '' )
        .replace( 'coffee', '' )

      let tmp = require(`${SchemaDIR}/${SchemaFile}`)
      let options = []

      let schema = tmp.schema || tmp.default.schema
      let model = tmp.model || tmp.default.model
      let modelname = tmp.modelName || tmp.default.modelName

      for( const PropertyName in schema.paths ) {
        const PropertyDescription = schema.paths[PropertyName]

        if( PropertyDescription.instance == 'Array' ) {
          let subheaders = []
          if( !PropertyDescription.options.ref && !PropertyDescription.caster.options.ref )
            for( let key of PropertyDescription.options.type[0] ) {
              let value = PropertyDescription.options.type[0][key]
              value.name = key
              subheaders.push(value)
            }
  
          options.push({
            name: PropertyName,
            isArray: true,
            type: PropertyDescription.caster.instance,
            subheaders: subheaders,
            required: PropertyDescription.isRequired || false,
            ref: PropertyDescription.options.ref || PropertyDescription.caster.options.ref || null,
            alias: PropertyDescription.options.alias || PropertyDescription.caster.options.alias || null,
            description: PropertyDescription.options.description || PropertyDescription.caster.options.description || null,
            default: PropertyDescription.defaultValue || PropertyDescription.caster.defaultValue || null,
            minReadAuth: PropertyDescription.options.minReadAuth || PropertyDescription.caster.options.minReadAuth || 300,
            minWriteAuth: PropertyDescription.options.minWriteAuth || PropertyDescription.caster.options.minWriteAuth || 300,
          })
        }
        else {
          options.push({
            name: PropertyName,
            isArray: false,
            type: PropertyDescription.instance,
            required: PropertyDescription.isRequired || false,
            ref: PropertyDescription.options.ref || null,
            alias: PropertyDescription.options.alias || null,
            description: PropertyDescription.options.description || null,
            default: PropertyDescription.defaultValue || null,
            minReadAuth: PropertyDescription.options.minReadAuth || 300,
            minWriteAuth: PropertyDescription.options.minWriteAuth || 300,
          })
        }
      }
      this.Schema[modelname] = options
      this.Models[modelname] = model
      this.Middlewares[modelname] = {
        C: {},
        R: {},
        U: {},
        D: {},
      }
    }

    // plug in ref schemas
    for( const ModelName in this.Schema )
      for( let [index, item] of this.Schema[ModelName].entries() ) {
        if( item.ref )
          this.Schema[ModelName][index].subheaders = this.Schema[item.ref]
      }

    this.GenerateProto()

    load( path.resolve(__dirname, './api.proto'), (error, api) => {
      if(!error) this.API = api
    })
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

  GetHeaders( model ) {
    const Headers = [] // { name, key, subheaders }

    for( let item of this.Schema[model] ) {
      if(!item.alias) continue

      if( !item.isArray && !item.ref )
        Headers.push({ name: item.alias, key: item.name, description: item.description })
      else {
        let subheaders = []
        for( let subitem of item.subheaders )
          subheaders.push({ name: subitem.alias, key: subitem.name, description: subitem.description })
        Headers.push({ name: item.alias, key: item.name, description: item.description, subheaders: subheaders })
      }
    }

    return Headers
  }

  GenerateRoutes() {
    Router.get( '/schema', (req, res) => res.send(this.Schema) )

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

    Router.use( '/protofile', express.static(path.resolve(__dirname, './api.proto')) )

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
