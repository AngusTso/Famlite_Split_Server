const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config();
const app = express();
const server = http.createServer(app);

const Task = require("./models/Task");
const User = require("./models/User");
const Group = require("./models/Group");

app.use(cors({ origin: "*" }));
app.get("/", (req, res) => res.send("伺服器活著！"));
app.use(express.json());

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

//database connect
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected succesfully"))
  .catch((err) => console.log("MongoDb connect failed" + err));

io.on("connection", (socket) => {
  console.log("Someone connected");
  socket.on("joinGroup", (groupId) => {
    socket.join(groupId);

    const clients = io.sockets.adapter.rooms.get(groupId);
    console.log(clients);

    console.log("A user joined :" + groupId);
  });
  socket.on("disconnect", () => console.log("Someone disconnected"));
});

app.post("/tasks", async (req, res) => {
  try {
    console.log(req.body);
    const task = new Task({
      taskName: req.body.taskName,
      groupId: req.body.groupId,
      createdBy: req.body.createdBy,
      dueDate: req.body.dueDate,
      description: req.body.description,
      assignedTo: req.body.assignedTo || null,
    });
    const savedTask = await task.save();
    console.log("Saved : " + savedTask);

    const clients = io.sockets.adapter.rooms.get(savedTask.groupId.toString());
    console.log(clients);

    io.to(savedTask.groupId.toString()).emit("taskCreated", savedTask);
    res.status(201).json(savedTask);
  } catch (e) {
    res.status(500).json({ err: e.message });
  }
});

app.post("/groups", async (req, res) => {
  try {
    console.log(req.body);
    const group = new Group({
      taskName: req.body.taskName,
      leaderId: req.body.leaderId,
      members: [req.body.leaderId],
    });
    const savedGroup = await group.save();
    console.log("Created : " + savedGroup);

    const clients = io.sockets.adapter.rooms.get(savedTask.groupId.toString());
    console.log(clients);

    io.to(savedGroup._id.toString()).emit("groupCreated", savedGroup);
    res.status(201).json(savedGroup);
  } catch (e) {
    res.status(500).json({ err: e.message });
  }
});

app.put("/tasks/:taskId", async (req, res) => {
  try {
    const task = await Task.findById(req.params.taskId);
    const { taskName, description, dueDate, assignedTo, isCompleted } =
      req.body;
    if (!task) return res.status(404).json({ error: "Task not found" });
    if (taskName !== undefined) task.taskName = taskName;
    if (description !== undefined) task.description = description;
    if (dueDate !== undefined)
      task.dueDate = dueDate ? new Date(dueDate) : null;
    if (assignedTo !== undefined) task.assignedTo = assignedTo || null;
    if (isCompleted !== undefined) task.isCompleted = isCompleted;
    task.updatedAt = new Date();

    const updatedTask = await task.save();

    io.to(updatedTask.groupId.toString()).emit("taskUpdated", updatedTask);
    res.json(updatedTask);
  } catch (e) {
    res.status(500).json({ err: e.message });
  }
});

app.get("/tasks", async (req, res) => {
  try {
    const groupId = req.query.groupId;
    const tasks = await Task.find({ groupId });
    res.json(tasks);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/groups/:groupId/members", async (req, res) => {
  try {
    console.log("groupid:" + req.params.groupId);
    const group = await Group.findById(req.params.groupId).populate("members");
    console.log(group);
    if (!group) return res.status(404).json({ error: "Group not found" });
    res.json(group.members);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/users/:userId/groups", async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).populate("groups");
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user.groups);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

server.listen(3000, () => console.log("伺服器跑在 port 3000"));
