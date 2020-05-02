const { load } = require('protobufjs');

export default class __API {
  constructor( axios, Prefix ) {
    this.$axios = axios
    this.Prefix = Prefix
  }
  initProto(Protofile) {
    return new Promise((resolve, reject) => {
      load(Protofile, (error, api) => {
        if (error) return reject()
        this.API = api
        resolve()
      })
    })
  }
  _capitalize( string ) {
    return string.charAt(0).toUpperCase() + string.slice(1)
  }
  GetService(Service, Function, Params) {
    this.$axios.$get(`/${this.Prefix}/getter/${Service.toLowerCase()}/${Function}`, { params: Params })
    .then( r => resolve(r))
    .catch( Error => reject(Error))
  }
  RunService(Service, Function, Params) {
    this.$axios.$post(`/${this.Prefix}/runner/${Service.toLowerCase()}/${Function}`, Params )
    .then( r => resolve(r))
    .catch( Error => reject(Error))
  }
  Schema() {
    return new Promise((resolve, reject) => {
      this.$axios.$delete(`/${this.Prefix}/schema`)
      .then( r => resolve(r))
      .catch( Error => reject(Error.response.data))
    })
  }
  Read( Model, Options = {}) {
    return new Promise((resolve, reject) => {
      this.$axios.$get(`/${this.Prefix}/${this._capitalize(Model)}/find`, {
        params: {
          filter: Options.filter || {},
          projection: Options.projection,
          sort: Options.sort || {},
          skip: Options.skip,
          limit: Options.limit
        }
      }).then( r => resolve(r))
      .catch( Error => reject(Error))
    })
  }
  Get( Model, Id, Options = {}) {
    return new Promise((resolve, reject) => {
      this.$axios.$get(`/${this.Prefix}/${this._capitalize(Model)}/${Id}`, {
        params: {
          projection: Options.projection,
        }
      }).then( r => resolve(r))
      .catch( Error => reject(Error))
    })
  }
  Create( Model, Data ) {
    return new Promise((resolve, reject) => {
      this.$axios.$post(`/${this.Prefix}/${this._capitalize(Model)}`, Data)
      .then( r => resolve(r))
      .catch( Error => reject(Error.response.data) )
    })
  }
  Update( Model, Data ) {
    return new Promise((resolve, reject) => {
      this.$axios.$patch(`/${this.Prefix}/${this._capitalize(Model)}`, Data)
      .then( r => resolve(r))
      .catch( Error => reject(Error.response.data))
    })
  }
  Delete( Model, Id ) {
    return new Promise((resolve, reject) => {
      this.$axios.$delete(`/${this.Prefix}/${this._capitalize(Model)}/${Id}`)
      .then( r => resolve(r))
      .catch( Error => reject(Error.response.data))
    })
  }

  TableHeaders( Model ) {
    return new Promise((resolve, reject) => {
      this.$axios.$get(`/${this.Prefix}/tableheaders/${this._capitalize(Model)}`)
      .then( r => resolve(r))
      .catch( Error => reject(Error.response.data))
    })
  }

  Table( Model, Options = {} ) {
    return new Promise((resolve, reject) => {
      Promise.all([ this.TableHeaders(Model), this.Read(Model, Options) ])
      .then( promises => resolve({ Headers: promises[0], Data: promises[1] }) )
      .catch( Error => reject(Error.response.data))
    })
  }

  ProtoTable( Model, Options = {} ) {
    return new Promise((resolve, reject) => {
      Promise.all([ this.TableHeaders(Model), this.ProtoRead(Model, Options) ])
      .then( promises => resolve({ Headers: promises[0], Data: promises[1] }) )
      .catch( Error => reject(Error.response.data))
    })
  }

  ProtoRead( Model, Options = {} ) {
    return new Promise((resolve, reject) => {
      if (!this.API) return reject("Protobuf file isn't set. Use initProto() to set it.")

      this.$axios.get(`/${this.Prefix}/proto/${this._capitalize(Model)}`, {
        responseType: 'arraybuffer',
        params: {
          filter: Options.filter || {},
          projection: Options.projection,
          sort: Options.sort || {},
          skip: Options.skip,
          limit: Options.limit
        }
      }).then( response => {
        const ProtoType = this.API.lookupType(`api.${this._capitalize(Model)}s`)
        resolve( ProtoType.decode( new Uint8Array(response.data))[`${this._capitalize(Model)}s`] )
      }).catch( Error => reject(Error))
    })
  }
}
