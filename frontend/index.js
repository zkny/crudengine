String.prototype.capitalize = function () {
  return this.charAt(0).toUpperCase() + this.slice(1)
}

class __API {
  constructor(ctx) {
    this.$axios = ctx.$axios
    this.Proto = {

      Read: ( Model, Limit = null, Sort = null, Filter = null ) => {
        return new Promise((resolve, reject) => {
          this.$axios.$get(`/crud/proto/${Model.capitalize()}`, {
            params: {
              sort: Sort || { _id: 1 },
              limit: Limit,
              filter: Filter || {}
            }
          })
          .then( r => resolve(r))
          .catch( Error => reject(Error.response.data))
        })
      },

      Table: ( Model, Limit = null, Sort = null, Filter = null ) => {
        return new Promise((resolve, reject) => {
          let promises = []
          promises.push( new Promise(res, rej) => {
            this.$axios.$get(`/crud/proto/${Model.capitalize()}`, {
              params: {
                sort: Sort || { _id: 1 },
                limit: Limit,
                filter: Filter || {}
              }
            })
            .then( r => res(r))
            .catch( Error => rej(Error.response.data))
          })
          promises.push( new Promise(res, rej) => {
            this.$axios.$get(`/crud/tableheaders/${Model.capitalize()}`)
            .then( r => res(r))
            .catch( Error => rej(Error.response.data))
          })
          Promise.all(promises)
          .then(results => {
            resolve({ Headers: result[1], Data: results[0] })
          }).catch( Error => reject(Error.response.data))
        })
      }

    }
  }
  GetService(Service, Function, Params) {
    this.$axios.$get(`/crud/getter/${Service.toLowerCase()}/${Function}`, { params: Params })
    .then( r => resolve(r))
    .catch( Error => reject(Error))
  }
  RunService(Service, Function, Params) {
    this.$axios.$post(`/crud/runner/${Service.toLowerCase()}/${Function}`, Params )
    .then( r => resolve(r))
    .catch( Error => reject(Error))
  }
  Read( Model, Options = {}) {
    return new Promise((resolve, reject) => {
      // options: {fields: array, include: Bool default true, filter: mongodb filter object}
      this.$axios.$get(`/crud/${Model.capitalize()}/find`, {
        params: {
          fields: Options.fields,
          include: Options.include,
          filter: Options.filter || {}
        }
      }).then( r => resolve(r))
      .catch( Error => reject(Error))
    })
  }
  Get( Model, Id, Options = {}) {
    return new Promise((resolve, reject) => {
      // options: {fields: array, include: Bool default true}
      this.$axios.$get(`/crud/${Model.capitalize()}/${Id}`, {
        params: {
          fields: Options.fields,
          include: Options.include
        }
      }).then( r => resolve(r))
      .catch( Error => reject(Error))
    })
  }
  Create( Model, Data ) {
    return new Promise((resolve, reject) => {
      this.$axios.$post(`/crud/${Model.capitalize()}`, Data)
      .then( r => resolve(r))
      .catch( Error => reject(Error.response.data) )
    })
  }
  Update( Model, Data ) {
    return new Promise((resolve, reject) => {
      this.$axios.$patch(`/crud/${Model.capitalize()}`, Data)
      .then( r => resolve(r))
      .catch( Error => reject(Error.response.data))
    })
  }
  Delete( Model, Id ) {
    return new Promise((resolve, reject) => {
      this.$axios.$delete(`/crud/${Model.capitalize()}/${Id}`)
      .then( r => resolve(r))
      .catch( Error => reject(Error.response.data))
    })
  }

  Table( Model, Limit = null, Sort = null, Filter = null ) {
    return new Promise((resolve, reject) => {
      this.$axios.$get(`/crud/table/${Model.capitalize()}`, {
        params: {
          sort: Sort || { _id: 1 },
          limit: Limit,
          filter: Filter || {}
        }
      })
      .then( r => resolve(r))
      .catch( Error => reject(Error.response.data))
    })
  }
}


export default ( ctx, inject ) => {

  const API = new __API(ctx)
  ctx.$API = API
  inject( 'API', API )

}
