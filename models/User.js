const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    minLength: 6,
    maxLength: 20,
    required: true,
    unique: true,
    index: true,
  },
  name: { type: String, minLength: 6, maxLength: 30, require: true },
  email: { type: String, require: true, unique: true, index: true },
  password: { type: String, required: true },
  groups: [{ type: mongoose.Schema.Types.ObjectId, ref: "Group", index: true }],
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("User", UserSchema);
