const { load } = require('protobufjs');

export default class __API {
  constructor( axios, Prefix, ServeStaticPath = 'static' ) {
    this.$axios = axios
    this.Prefix = Prefix
    this.ServeStaticPath = ServeStaticPath
  }
  Count(ModelName) {
    return new Promise((resolve, reject) => {
      this.$axios.$get(`${this.Prefix}/count/${ModelName}`)
      .then( r => resolve(r.count))
      .catch( Error => reject(Error))
    })
  }
  GetFileUrl(File) {
    return {
      path: `${this.$axios.defaults.baseURL}/${this.ServeStaticPath}/${File.path}`,
      thumbnail: `${this.$axios.defaults.baseURL}/${this.ServeStaticPath}/${File.thumbnailPath}`,
    }
  }
  GetFile(File) {
    return new Promise((resolve, reject) => {
      this.$axios.$get(`${this.Prefix}/${this.ServeStaticPath}/${File.path}`, { responseType: 'blob' })
      .then( r => {
        resolve(window.URL.createObjectURL( new Blob([r]) ))
      }).catch( Error => reject(Error))
    })
  }
  GetThumbnail(File) {
    return new Promise((resolve, reject) => {
      this.$axios.$get(`${this.Prefix}/${this.ServeStaticPath}/${File.thumbnailPath}`, { responseType: 'blob' })
      .then( r => {
        resolve(window.URL.createObjectURL( new Blob([r]) ))
      }).catch( Error => reject(Error))
    })
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
    return new Promise( (resolve, reject) => {
      this.$axios.$get(`/${this.Prefix}/getter/${Service.toLowerCase()}/${Function}`, { params: Params })
      .then( r => resolve(r))
      .catch( Error => reject(Error))
    })
  }
  RunService(Service, Function, Params) {
    return new Promise( (resolve, reject) => {
      this.$axios.$post(`/${this.Prefix}/runner/${Service.toLowerCase()}/${Function}`, Params )
      .then( r => resolve(r))
      .catch( Error => reject(Error))
    })
  }
  Schema(ModelName = null) {
    if (ModelName) {
      return new Promise((resolve, reject) => {
        this.$axios.$get(`/${this.Prefix}/schema/${ModelName}`)
        .then( r => resolve(r))
        .catch( Error => reject(Error))
      })
    }
    return new Promise((resolve, reject) => {
      this.$axios.$get(`/${this.Prefix}/schema`)
      .then( r => resolve(r))
      .catch( Error => reject(Error))
    })
  }
  SchemaKeys(ModelName, Depth) {
    return new Promise((resolve, reject) => {
      this.$axios.$post(`/${this.Prefix}/schemakeys/${ModelName}`, { depth: Depth })
      .then( r => resolve(r))
      .catch( Error => reject(Error))
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
    return new Promise( async (resolve, reject) => {
      let promises = []

      this.getFileKeys(Data, promises)
      let uploadedFiles = await Promise.all(promises)
      this.setFileFields(Data, uploadedFiles)

      this.$axios.$post(`/${this.Prefix}/${this._capitalize(Model)}`, Data)
        .then( r => resolve(r))
        .catch( async Error => {
          promises = []

          for(let file of uploadedFiles)
            promises.push( this.DeleteFile(file.path) )

          await Promise.all(promises)
          reject(Error)
        })
    })
  }
  setFileFields(object, results) {
    for( let key in object) {
      if( typeof object[key] == 'object' )
        this.setFileFields(object[key], results)

      if( object[key] instanceof File )
        object[key] = results.shift().path
    }
  }
  getFileKeys(object, promises) {
    for( let key in object) {
      if( typeof object[key] == 'object' )
        this.getFileKeys(object[key], promises)

      if( object[key] instanceof File )
        promises.push(this.UploadFile(object[key]))
    }
  }
  UploadFile( File, Callback ) {
    return new Promise((resolve, reject) => {

      const config = {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: function(progressEvent) {
          let percentage = Math.round((progressEvent.loaded * 100) / progressEvent.total)
          Callback(percentage)
        }
      }

      let formData = new FormData()

      formData.append('file', File)
      this.$axios.$post(`/${this.Prefix}/fileupload`, formData, config )
        .then( r => resolve(r))
        .catch( Error => reject(Error) )
    })
  }
  DeleteFile( File ) {
    return new Promise((resolve, reject) => {
      this.$axios.$delete(`/${this.Prefix}/filedelete/${File._id}`)
        .then( r => resolve(r) )
        .catch( Error => reject(Error) )
    })
  }
  Update( Model, Data ) {
    return new Promise((resolve, reject) => {
      this.$axios.$patch(`/${this.Prefix}/${this._capitalize(Model)}`, Data)
      .then( r => resolve(r))
      .catch( Error => reject(Error))
    })
  }
  Delete( Model, Id ) {
    return new Promise((resolve, reject) => {
      this.$axios.$delete(`/${this.Prefix}/${this._capitalize(Model)}/${Id}`)
      .then( r => resolve(r))
      .catch( Error => reject(Error))
    })
  }

  TableHeaders( Model ) {
    return new Promise((resolve, reject) => {
      this.$axios.$get(`/${this.Prefix}/tableheaders/${this._capitalize(Model)}`)
      .then( r => resolve(r))
      .catch( Error => reject(Error))
    })
  }

  Table( Model, Options = {} ) {
    return new Promise((resolve, reject) => {
      Promise.all([ this.TableHeaders(Model), this.Read(Model, Options) ])
      .then( promises => resolve({ Headers: promises[0], Data: promises[1] }) )
      .catch( Error => reject(Error))
    })
  }

  ProtoTable( Model, Options = {} ) {
    return new Promise((resolve, reject) => {
      Promise.all([ this.TableHeaders(Model), this.ProtoRead(Model, Options) ])
      .then( promises => resolve({ Headers: promises[0], Data: promises[1] }) )
      .catch( Error => reject(Error))
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
