const path = require("path");

const crud_engine = require("crudengine");

new crud_engine({
  SchemaDIR: path.resolve(__dirname,'./schemas'),
  ServiceDIR: path.resolve(__dirname,'./services'),
  FileDIR: path.resolve(__dirname, './files'),
  ImageHeightSize: 2000,
  Thumbnail: true,
  ThumbnailSize: 100,
})