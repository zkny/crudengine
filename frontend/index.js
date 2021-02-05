export default class __API {
  constructor(axios, Prefix, ServeStaticPath = 'static', defaultFilter = {}) {
    this.$axios = axios
    this.Prefix = Prefix
    this.ServeStaticPath = ServeStaticPath
    this.DefaultFilter = defaultFilter
  }

  Count(modelName, filter = this.DefaultFilter) {
    return new Promise((resolve, reject) => {
      this.$axios.$get(`${this.Prefix}/count/${modelName}`, {
        params: {filter},
      })
      .then( res => resolve(res.count) )
      .catch( err => reject(err) )
    })
  }

  GetFileUrl(file) {
    return {
      path: `${this.$axios.defaults.baseURL}/${this.ServeStaticPath}/${file.path}`,
      thumbnail: `${this.$axios.defaults.baseURL}/${this.ServeStaticPath}/${file.thumbnailPath}`,
    }
  }

  GetFile(file) {
    return new Promise((resolve, reject) => {
      this.$axios.$get(`${this.Prefix}/${this.ServeStaticPath}/${file.path}`, {
        responseType: 'blob',
      })
      .then( res => resolve(URL.createObjectURL(res)) )
      .catch( err => reject(err) )
    })
  }

  GetThumbnail(file) {
    return new Promise((resolve, reject) => {
      this.$axios.$get(`${this.Prefix}/${this.ServeStaticPath}/${file.thumbnailPath}`, {
        responseType: 'blob',
      })
      .then( res => resolve(URL.createObjectURL(res)) ) 
      .catch( err => reject(err) )
    })
  }

  GetService(serviceName, functionName, params) {
    return this.$axios.$get(`/${this.Prefix}/getter/${serviceName.toLowerCase()}/${functionName}`, {
      params: params,
    })
  }

  RunService(serviceName, functionName, params) {
    return this.$axios.$post(`/${this.Prefix}/runner/${serviceName.toLowerCase()}/${functionName}`, params)
  }

  Schema(modelName = null) {
    if(modelName)
      return this.$axios.$get(`/${this.Prefix}/schema/${modelName}`)

    return this.$axios.$get(`/${this.Prefix}/schema`)
  }

  SchemaKeys(modelName, depth) {
    return this.$axios.$post(`/${this.Prefix}/schemakeys/${modelName}`, {
      depth: depth,
    })
  }

  Read(modelName, options = {}) {
    return this.$axios.$get(`/${this.Prefix}/${modelName}/find`, {
      params: {
        filter: options.filter || this.DefaultFilter,
        projection: options.projection,
        sort: options.sort || {},
        skip: options.skip,
        limit: options.limit,
      }
    })
  }

  Get(modelName, id, options = {}) {
    return this.$axios.$get(`/${this.Prefix}/${modelName}/${id}`, {
      params: {
        projection: options.projection,
      }
    })
  }

  Create(modelName, data) {
    return this.$axios.$post(`/${this.Prefix}/${modelName}`, data)
  }

  UploadFile(file, callback) {
    const config = {
      headers: {'Content-Type': 'multipart/form-data'},
      onUploadProgress: event => {
        let percentage = Math.round((event.loaded * 100) / event.total)
        callback(percentage, event)
      }
    }

    let formData = new FormData()
    formData.append('file', file)

    return this.$axios.$post(`/${this.Prefix}/fileupload`, formData, config)
  }

  DeleteFile(file) {
    let id = typeof file == 'string' ? file : file._id

    return this.$axios.$delete(`/${this.Prefix}/filedelete/${id}`)
  }

  Update(modelName, data) {
    return this.$axios.$patch(`/${this.Prefix}/${modelName}`, data)
  }

  Delete(modelName, id) {
    return this.$axios.$delete(`/${this.Prefix}/${modelName}/${id}`)
  }

  TableHeaders(modelName) {
    return this.$axios.$get(`/${this.Prefix}/tableheaders/${modelName}`)
  }

  Table(modelName, options = {}) {
    return new Promise((resolve, reject) => {
      Promise.all([
        this.TableHeaders(modelName),
        this.Read(modelName, options)
      ])
      .then( res => resolve({headers: res[0], data: res[1]}) )
      .catch( err => reject(err))
    })
  }
}
