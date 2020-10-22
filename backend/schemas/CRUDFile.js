const mongoose = require("mongoose");

const CRUDFileSchema = new mongoose.Schema({
  name: { type: String, name: "File name", description: "Name of the saved file", required: true, primary: true },
  path: { type: String, name: "File path", description: "Path of the saved file", required: true },
  size: { type: Number, name: "File size", description: "Sized of the saved file", required: true },
  extension: { type: String, name: "File extension", description: "Extension of the saved file", required: true },
  isImage: { type: Boolean, name: "Is image?", description: "Indicates whether the saved file is an image or not", default: false },
  thumbnailPath: { type: String, name: "Thumbnail path", description: "Path of the saved thumbnail", default: null },
}, { selectPopulatedPaths: false });


// BrandSchema.plugin(autopopulate);
module.exports = mongoose.model('CRUDFile', CRUDFileSchema);
