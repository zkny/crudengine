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

  UploadFile(file, percentCallback) {
    let config = {
      headers: {'Content-Type': 'multipart/form-data'},
    }
    if(percentCallback)
      config.onUploadProgress = event => {
        let percentage = Math.round((event.loaded * 100) / event.total)
        percentCallback(percentage, event)
      }

    let formData = new FormData()
    formData.append('file', file)

    return this.$axios.$post(`/${this.Prefix}/fileupload`, formData, config)
  }

  GetFileURLs(file) {
    return {
      absolutePath: `${this.$axios.defaults.baseURL}/${this.Prefix}/${this.ServeStaticPath}/${file.path}`,
      relativePath: `/${this.Prefix}/${this.ServeStaticPath}/${file.path}`,
      absoluteThumbnailPath: `${this.$axios.defaults.baseURL}/${this.Prefix}/${this.ServeStaticPath}/${file.thumbnailPath}`,
      relativeThumbnailPath: `/${this.Prefix}/${this.ServeStaticPath}/${file.thumbnailPath}`,
    }
  }

  GetFileURL(file, percentCallback) {
    return new Promise((resolve, reject) => {
      this.DownloadFile(file, percentCallback)
        .then( res => resolve(URL.createObjectURL(res)) )
        .catch( err => reject(err) )
    })
  }

  DownloadFile(file, percentCallback) {
    let path = typeof file == 'string' ? file : file.path
    let config = {responseType: 'blob'}
    if(percentCallback)
      config.onDownloadProgress = event => {
        let percentage = Math.round((event.loaded * 100) / event.total)
        percentCallback(percentage, event)
      }

    return this.$axios.$get(`/${this.Prefix}/${this.ServeStaticPath}/${path}`, config)
  }

  GetThumbnailURL(file, percentCallback) {
    return new Promise((resolve, reject) => {
      this.DownloadThumbnail(file, percentCallback)
        .then( res => resolve(URL.createObjectURL(res)) ) 
        .catch( err => reject(err) )
    })
  }

  DownloadThumbnail(file, percentCallback) {
    let path = typeof file == 'string' ? file : file.thumbnailPath
    let config = {responseType: 'blob'}
    if(percentCallback)
      config.onDownloadProgress = event => {
        let percentage = Math.round((event.loaded * 100) / event.total)
        percentCallback(percentage, event)
      }

    return this.$axios.$get(`/${this.Prefix}/${this.ServeStaticPath}/${path}`, config)
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
