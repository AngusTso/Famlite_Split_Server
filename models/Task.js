const mongoose = require("mongoose");

const TaskSchema = new mongoose.Schema({
  taskName: { type: String, required: true, minLength: 1, maxLength: 50 },
  description: { type: String },
  isCompleted: { type: Boolean, default: false },
  groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Group",
    index: true,
  },
  dueDate: { type: Date },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Task", TaskSchema);
