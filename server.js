const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { nanoid } = require("nanoid");

dotenv.config();
const app = express();
const server = http.createServer(app);

const Task = require("./models/Task");
const User = require("./models/User");
const Group = require("./models/Group");
const { error } = require("console");

app.use(cors({ origin: "*" }));
app.get("/", (req, res) => res.send("伺服器活著！"));
app.use(express.json());

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "DELETE"],
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

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) return res.status(401).json({ error: "Token not provided" });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ Error: "Token not valid" });
    req.user = user;
    console.log(req.user);
    next();
  });
};

//Register Api
app.post("/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: "Please enter all field" });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be longer than 5" });
    }
    const existedUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existedUser) {
      return res.status(400).json({ error: "username/email already existed" });
    }
    const hashedPassowrd = await bcrypt.hash(password, 10);
    const user = new User({
      username,
      email,
      password: hashedPassowrd,
      name: username,
    });
    console.log("here");
    const savedUser = await user.save();

    const token = jwt.sign({ userId: savedUser._id }, process.env.JWT_SECRET, {
      expiresIn: "1d",
    });
    res.status(200).json({ token, user: savedUser });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

//Login Api
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Must enter all field" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: "Incorrect email/password" });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Incorrect email/password" });
    }
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "1d",
    });

    res.json({ token, user });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

//Create Task
app.post("/tasks", authenticateToken, async (req, res) => {
  try {
    const { taskName, groupId, dueDate, description, assignedTo } = req.body;
    if (!taskName || !groupId) {
      return res.status(400).json({ error: "Must have Task Name and GroupId" });
    }
    const group = await Group.findById(groupId);
    if (!group) return res.status(401).json({ error: "Group not exist" });

    if (!group.members.includes(req.user.userId)) {
      return res.status(403).json({ error: "You are not group member" });
    }

    const task = new Task({
      taskName,
      groupId,
      createdBy: req.user.userId,
      dueDate: dueDate ? new Date(dueDate) : null,
      description,
      assignedTo: assignedTo || null,
    });
    const savedTask = await task.save();
    console.log("Saved : " + savedTask);

    // const clients = io.sockets.adapter.rooms.get(savedTask.groupId.toString());
    // console.log(clients);

    io.to(savedTask.groupId.toString()).emit("taskCreated", savedTask);
    res.status(201).json(savedTask);
  } catch (e) {
    res.status(500).json({ err: e.message });
  }
});

//Create Group
app.post("/groups", authenticateToken, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: "Group name is required" });
    }
    const inviteCode = nanoid(10); // Generate a 10-character invite code
    const inviteLink = `http://famSplit.com/invite/${inviteCode}`;

    const group = new Group({
      name: name,
      leaderId: req.user.userId, // Use authenticated user ID
      members: [req.user.userId],
      inviteCode,
      inviteLink,
      inviteExpriedAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    const savedGroup = await group.save();
    console.log("Created : " + savedGroup);

    // const clients = io.sockets.adapter.rooms.get(savedGroup._id.toString());
    // console.log(clients);

    await User.findByIdAndUpdate(
      req.user.userId,
      {
        $push: { groups: savedGroup._id },
      },
      { new: true }
    );

    io.to(savedGroup._id.toString()).emit("groupCreated", savedGroup);
    res.status(201).json(savedGroup);
  } catch (e) {
    console.error("Create Group Error:", e.stack);
    res.status(500).json({ error: e.message || "Failed to create group" });
  }
});

//Join Group by Invite Code
app.post("/groups/join", authenticateToken, async (req, res) => {
  try {
    const { inviteCode } = req.body;
    if (!inviteCode) {
      return res.status(400).json({ error: "Invite code is required" });
    }

    const group = await Group.findOne({ inviteCode });
    if (!group) {
      return res.status(404).json({ error: "Invalid invite code" });
    }

    if (new Date(group.inviteExpiredAt) < new Date()) {
      return res.status(400).json({ error: "Invite code has expired" });
    }

    if (group.members.includes(req.user.userId)) {
      return res
        .status(400)
        .json({ error: "You are already a member of this group" });
    }

    // Add user to group members
    group.members.push(req.user.userId);
    await group.save();

    // Add group to user's groups
    await User.findByIdAndUpdate(
      req.user.userId,
      { $push: { groups: group._id } },
      { new: true }
    );

    io.to(group._id.toString()).emit("userJoined", {
      userId: req.user.userId,
      groupId: group._id,
    });

    res.status(200).json({ message: "Successfully joined group", group });
  } catch (e) {
    console.error("Join Group Error:", e.stack);
    res.status(500).json({ error: e.message || "Failed to join group" });
  }
});

//Update Task
app.put("/tasks/:taskId", authenticateToken, async (req, res) => {
  try {
    const task = await Task.findById(req.params.taskId);
    console.log(req.params.taskId);
    if (!task) return res.status(404).json({ error: "Task not found" });
    const group = await Group.findById(req.body.groupId);
    if (!group) return res.status(401).json({ error: "Group not exist" });

    if (!group.members.includes(req.user.userId)) {
      return res.status(403).json({ error: "You are not group member" });
    }

    console.log(group);

    const { taskName, description, dueDate, assignedTo, isCompleted } =
      req.body;
    if (taskName !== undefined) task.taskName = taskName;
    if (description !== undefined) task.description = description;
    if (dueDate !== undefined)
      task.dueDate = dueDate ? new Date(dueDate) : null;
    if (assignedTo !== undefined) task.assignedTo = assignedTo || null;
    if (isCompleted !== undefined) task.isCompleted = isCompleted;
    task.updatedAt = new Date();

    const updatedTask = await task.save();

    console.log("updated");
    io.to(updatedTask.groupId.toString()).emit("taskUpdated", updatedTask);
    res.json(updatedTask);
  } catch (e) {
    res.status(500).json({ err: e.message });
  }
});

app.delete("/tasks/:taskId", authenticateToken, async (req, res) => {
  try {
    const task = await Task.findById(req.params.taskId);
    if (!task) return res.status(404).json({ error: "Task not found" });

    const group = await Group.findById(task.groupId);
    if (!group) return res.status(401).json({ error: "Group not exist" });

    if (!group.members.includes(req.user.userId)) {
      return res.status(403).json({ error: "You are not group member" });
    }

    await Task.deleteOne({ _id: req.params.taskId });

    io.to(task.groupId.toString()).emit("taskDeleted", {
      taskId: req.params.taskId,
    });
    res.status(200).json({ message: "Task deleted successfully" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

//Get Tasks
app.get("/tasks", authenticateToken, async (req, res) => {
  try {
    const groupId = req.query.groupId;
    console.log("groupID", groupId);
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ error: "Group not exist" });
    }
    if (!group.members.includes(req.user.userId)) {
      return res.status(403).json({ error: "You are not group member" });
    }
    const tasks = await Task.find({ groupId });
    res.json(tasks);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

//Get a group Members
app.get("/groups/:groupId/members", authenticateToken, async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId).populate("members");
    console.log("group: " + group);
    if (!group) {
      return res.status(404).json({ error: "Group not exist" });
    }
    if (
      !group.members.some((member) => member._id.toString() === req.user.userId)
    ) {
      return res.status(403).json({ error: "您不是該群組成員" });
    }
    if (!group) return res.status(404).json({ error: "Group not found" });
    res.json(group.members);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

//Get group detail of specific group
app.get("/groups/:groupId", authenticateToken, async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId);
    console.log(group);
    if (!group) return res.status(404).json({ error: "Group not exist" });
    if (
      !group.members.some((member) => member._id.toString() === req.user.userId)
    ) {
      console.log("group:", group.members);
      return res.status(403).json({ error: "You are not group member" });
    }
    res.json(group);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

//Get all group for a user
app.get("/users/:userId/groups", authenticateToken, async (req, res) => {
  try {
    console.log(req.params.userId, req.user.userId);
    if (req.params.userId !== req.user.userId) {
      return res
        .status(403)
        .json({ error: "You can't authorised other user's group" });
    }
    const user = await User.findById(req.params.userId).populate("groups");
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user.groups);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/tasks/shuffle", authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.body;
    if (!groupId) return res.status(400).json({ error: "Must be in a group" });

    const group = await Group.findById(groupId).populate("members");
    if (!group) return res.status(404).json({ error: "Group not found" });
    if (
      !group.members.some((member) => member._id.toString() === req.user.userId)
    ) {
      return res.status(403).json({ error: "You are not group member" });
    }

    const tasks = await Task.find({ groupId });
    const members = group.members.map((member) => member._id.toString());
    if (members.length === 0) {
      return res.status(400).json({ error: "群組內無成員可分配" });
    }

    const bulkOps = tasks.map((task) => ({
      updateOne: {
        filter: { _id: task._id },
        update: {
          $set: {
            assignedTo: members[Math.floor(Math.random() * members.length)],
            updatedAt: new Date(),
          },
        },
      },
    }));

    await Task.bulkWrite(bulkOps);
    const updatedTasks = await Task.find({ groupId });

    updatedTasks.forEach((task) => {
      io.to(groupId.toString()).emit("taskUpdated", task);
    });

    res.json(updatedTasks);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
server.listen(3000, () => console.log("伺服器跑在 port 3000"));
