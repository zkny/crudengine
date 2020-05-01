const Services = {
  LogSomething: (Data) => {
    return new Promise((resolve, reject) => {
      console.log(Data);
      resolve({ msg: "logged something" })
    })
  },
  LogSomethingElse: async (Data) => {
    return await this.LogSomething(Data)
  }
}

module.exports = Services