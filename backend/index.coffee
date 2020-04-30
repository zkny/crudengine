express      = require 'express'
mongoose     = require 'mongoose'
autopopulate = require 'mongoose-autopopulate'
fs           = require 'fs'
path         = require 'path'
{ load }     = require 'protobufjs'

Router = express.Router()

class CrudEngine
  Schema: {}
  Services: {}
  Models: {}
  Operations: ['C', 'R', 'U', 'D']
  Timings: ['after', 'before']
  API: false

  constructor: (@SchemaDIR, @ServiceDIR) ->
    ServiceDIR = @ServiceDIR
    SchemaDIR = @SchemaDIR
    @Middlewares = {}

    SchemaFileArray = fs.readdirSync(SchemaDIR)
    if ServiceDIR
      ServiceFileArray = fs.readdirSync( ServiceDIR )
      for ServiceFile in ServiceFileArray
        if ServiceFile is '.DS_Store' or ServiceFile.includes '.map'
          continue
        ServiceName = ServiceFile
        .replace '.js', ''
        .replace '.ts', ''
        .replace 'coffee', ''

        @Services[ServiceName] = require "#{ServiceDIR}/#{ServiceFile}"

    for SchemaFile in SchemaFileArray
      if SchemaFile is '.DS_Store' or SchemaFile.includes '.map'
        continue
      SchemaName = SchemaFile
      .replace '.js', ''
      .replace '.ts', ''
      .replace 'coffee', ''

      tmp = require "#{SchemaDIR}/#{SchemaFile}"
      options = []

      schema = tmp.schema || tmp.default.schema
      model = tmp.model || tmp.default.model
      modelname = tmp.modelName || tmp.default.modelName

      for PropertyName, PropertyDescription of schema.paths
        if PropertyDescription.instance is 'Array'

          subheaders = []
          if !PropertyDescription.options.ref && !PropertyDescription.caster.options.ref
            for key, value of PropertyDescription.options.type[0]
              value.name = key
              subheaders.push value

          options.push {
            name: PropertyName
            isArray: true
            type: PropertyDescription.caster.instance
            subheaders: subheaders
            required: PropertyDescription.isRequired || false
            ref: PropertyDescription.options.ref || PropertyDescription.caster.options.ref || null
            alias: PropertyDescription.options.alias || PropertyDescription.caster.options.alias || null
            description: PropertyDescription.options.description || PropertyDescription.caster.options.description || null
            default: PropertyDescription.defaultValue || PropertyDescription.caster.defaultValue || null
            minReadAuth: PropertyDescription.options.minReadAuth || PropertyDescription.caster.options.minReadAuth || 300
            minWriteAuth: PropertyDescription.options.minWriteAuth || PropertyDescription.caster.options.minWriteAuth || 300
          }
        else
          options.push {
            name: PropertyName
            isArray: false
            type: PropertyDescription.instance
            required: PropertyDescription.isRequired || false
            ref: PropertyDescription.options.ref || null
            alias: PropertyDescription.options.alias || null
            description: PropertyDescription.options.description || null
            default: PropertyDescription.defaultValue || null
            minReadAuth: PropertyDescription.options.minReadAuth || 300
            minWriteAuth: PropertyDescription.options.minWriteAuth || 300
          }
      @Schema[modelname] = options
      @Models[modelname] = model
      @Middlewares[modelname] = {
        C: {},
        R: {},
        U: {},
        D: {},
      }
    # plug in ref schemas
    for ModelName, Schema of @Schema
      for item, index in Schema
        if item.ref
          @Schema[ModelName][index].subheaders = @Schema[item.ref]

    @GenerateProto()

    # the api.proto file should be done at this point
    # load path.resolve(__dirname, './api.proto'), (error, api) =>
    #   if !error @API = api

  GenerateProto: () =>
    proto = "package api;\nsyntax = \"proto3\";\n\n"

    for ModelName, Schema of @Schema
      proto += "message #{ModelName} {\n"
      id = 1

      for item in Schema
        type = @GetCorrectType( item )
        if type == null then continue

        proto += "\t#{type} #{item.name} = #{id};\n"
        id++
      proto += "}\n"

      proto += "message #{ModelName}s {\n\trepeated #{ModelName} #{ModelName} = 1;\n}\n\n"

    fs.writeFileSync path.resolve(__dirname, './api.proto'), proto, {flag: "w+"}

  GetCorrectType: (item) =>
    switch item.type
      when 'Number' then 'float'
      when 'String' then 'string'
      when 'ObjectID'
        if item.ref then item.ref
        else 'string'
      else null

  GetDeclinedReadFields: (uId, model) =>
    return new Promise (resolve, reject) =>
      mongoose.model('User').findOne {_id: uId}, (error, user) =>
        resolve( @Schema[model].filter((field) => field.minReadAuth != undefined && field.minReadAuth < user.accesslevel).map((one) => one.name) )

  GetDeclinedWriteFields: (uId, model) =>
    return new Promise (resolve, reject) =>
      mongoose.model('User').findOne {_id: uId}, (error, user) =>
        declinedFields = @Schema[model].filter((field) => field.minWriteAuth != undefined && field.minWriteAuth < user.accesslevel)
        if declinedFields.filter((one) => one.required).length then return resolve(null)
        resolve( declinedFields.map((one) => one.name) )

  GetProjection: (uId, model, fields = [], include = false) =>
    projection = {}

    if !include then fields.map (one) => projection[one] = 0
    else @Schema[model].map (one) => if !fields.includes(one.name) then projection[one.name] = 0

    (await @GetDeclinedReadFields(uId, model)).map( (one) => projection[one.name] = 0 )

    if Object.keys(projection).length == 0 then return { __v: 0 } else return projection

  GetHeaders: ( model ) =>
    Headers = [] # { name, key, subheaders }
    for item in @Schema[model]
      if !item.alias then continue

      if !item.isArray && !item.ref
        Headers.push { name: item.alias, key: item.name, description: item.description }
      else
        subheaders = []
        for subitem in item.subheaders
          subheaders.push { name: subitem.alias, key: subitem.name, description: subitem.description }
        Headers.push { name: item.alias, key: item.name, description: item.description, subheaders: subheaders }
    return Headers

  GenerateRoutes: () ->
    Router.get '/schema', (req, res) =>
      res.send(@Schema)

    # Generate the crud routes for each model
    Router.get '/getter/:service/:fun', (req, res) =>
      @Services[req.params.service][req.params.fun].call(null,{ route: req.params, params: req.query })
      .then (data) -> res.send data
      .catch (error) -> res.status(500).send error

    Router.post '/runner/:service/:fun', (req, res) =>
      @Services[req.params.service][req.params.fun].call(null,{ route: req.params, params: req.body })
      .then (data) -> res.send data
      .catch (error) -> res.status(500).send error


    Router.get '/proto/:model', (req, res) =>
      Headers = @GetHeaders(req.params.model)
      MFunctions = @Middlewares[req.params.model].R
      projection = await @GetProjection(req.user._id, req.params.model)

      if MFunctions.before and await eval(MFunctions.before) == true then return
      mongoose.model(req.params.model).find JSON.parse(req.query.filter), projection, (error, results) ->
        if error then return res.status(500).send Error
        if MFunctions.after and await eval(MFunctions.after) == true then return

        ProtoType = @API.lookupType "api.#{req.params.model}s"
        message = ProtoType.fromObject { ["#{req.params.model}s"]: results }
        buffer = ProtoType.encode(message).finish()

        res.send buffer

    Router.get '/tableheaders/:model', (req, res) =>
      res.send @GetHeaders(req.params.model)

    Router.get '/table/:model', (req, res) =>
      Headers = @GetHeaders(req.params.model)
      MFunctions = @Middlewares[req.params.model].R
      projection = await @GetProjection(req.user._id, req.params.model)

      if MFunctions.before and await eval(MFunctions.before) == true then return
      mongoose.model(req.params.model).find JSON.parse(req.query.filter), projection
      .sort JSON.parse req.query.sort
      .limit req.query.limit
      .then (results) =>
        if MFunctions.after and await eval(MFunctions.after) == true then return
        res.send { Headers, Data: results }
      .catch (error) => res.status(500).send error

    Router.get '/:model/find', (req, res) =>
      MFunctions = @Middlewares[req.params.model].R
      projection = await @GetProjection(req.user._id, req.params.model, req.query.fields, req.query.include == 'true')

      if MFunctions.before and await eval(MFunctions.before) == true then return
      mongoose.model(req.params.model).find JSON.parse(req.query.filter), projection, (error, results) =>
        if error then return res.status(500).send error
        if MFunctions.after and await eval(MFunctions.after) == true then return
        res.send results

    Router.get "/:model/:id", (req, res) =>
      MFunctions = @Middlewares[req.params.model].R
      projection = await @GetProjection(req.user._id, req.params.model, req.query.fields, req.query.include == 'true')
      if MFunctions.before and await eval(MFunctions.before) == true then return
      mongoose.model(req.params.model).findOne { _id: req.params.id }, projection, (error, results) =>
        if error then return res.status(500).send error
        if MFunctions.after and await eval(MFunctions.after) == true then return
        res.send results

    Router.post "/:model", (req, res) =>
      MFunctions = @Middlewares[req.params.model].C
      declinedFields = await @GetDeclinedWriteFields(req.user._id, req.params.model)

      if declinedFields == null then return res.status(500).send('EPERM')
      declinedFields.map (one) => delete req.body[one]

      if MFunctions.before and await eval(MFunctions.before) == true then return
      Mod = mongoose.model(req.params.model)
      results = new Mod req.body
      results.save (error, results) =>
        if error then return res.status(500).send error
        if MFunctions.after and await eval(MFunctions.after) == true then return
        res.send results

    Router.patch "/:model", (req, res) =>
      MFunctions = @Middlewares[req.params.model].U
      declinedFields = await @GetDeclinedWriteFields(req.user._id, req.params.model)

      if declinedFields == null then return res.status(500).send('EPERM')
      declinedFields.map (one) => delete req.body[one]

      if MFunctions.before and await eval(MFunctions.before) == true then return
      mongoose.model(req.params.model).updateOne { _id: req.body._id }, req.body, (error, results) =>
        if error then return res.status(500).send error
        if MFunctions.after and await eval(MFunctions.after) == true then return
        res.send results

    Router.delete "/:model/:id", (req, res) =>
      MFunctions = @Middlewares[req.params.model].D
      declinedFields = await @GetDeclinedWriteFields(req.user._id, req.params.model)

      if declinedFields == null || declinedFields.length then return res.status(500).send('EPERM')

      if MFunctions.before and await eval(MFunctions.before) == true then return
      mongoose.model(req.params.model).deleteOne { _id: req.params.id }, (error) =>
        if error then return res.status(500).send error
        if MFunctions.after and await eval(MFunctions.after) == true then return
        res.send 'ok'

    return Router

  # Azert Promise, hogy lehessen rendes error handlinget csinalni vele, ha kesobb bovitjuk
  addMiddleware: ( modelname, operation, timing, middlewareFunction ) =>
    return new Promise (resolve, reject) =>
      if( !@Middlewares[modelname] ) then return reject new Error("No model found with name: #{modelname}")
      if( !@Operations.some((o) => o == operation) ) then return reject new Error("Operation should be one of: #{@Operations}")
      if( !@Timings.some((o) => o == timing) ) then return reject new Error("Timing should be one of: #{@Timings}")

      @Middlewares[modelname][operation][timing] = "(#{middlewareFunction.toString()})()"
      return resolve 'Middleware added'



module.exports.default = CrudEngine
