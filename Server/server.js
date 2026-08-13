require("dotenv").config();

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { createServer } = require("node:http");
const path = require("node:path");
const { Server } = require("socket.io");
const fs = require("node:fs");
const {
  initDatabase,
  insertPlayerLog,
  updateResultImageUrl,
  getAllLogs,
} = require("./db");

initDatabase();

const port = process.env.PORT || 3000;
const PUBLIC_BASE_URL =
  process.env.PUBLIC_BASE_URL || `http://localhost:${port}`;

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

app.use(cors());

const uploadDirectory = path.join(__dirname, "uploads");
const outputDirectory = path.join(__dirname, "outputs");

if (!fs.existsSync(uploadDirectory)) {
  fs.mkdirSync(uploadDirectory, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDirectory);
  },
  filename: (req, file, cb) => {
    const extension = file.mimetype.split("/")[1] || "jpg";
    const uniqueName = `source_${Date.now()}.${extension}`;
    cb(null, uniqueName);
  },
});

const upload = multer({ storage });

app.use(
  "/display",
  (req, res, next) => {
    if (req.url.endsWith(".br")) {
      res.setHeader("Content-Encoding", "br");

      if (req.url.endsWith(".js.br")) {
        res.setHeader("Content-Type", "application/javascript");
      } else if (req.url.endsWith(".wasm.br")) {
        res.setHeader("Content-Type", "application/wasm");
      } else if (req.url.endsWith(".data.br")) {
        res.setHeader("Content-Type", "application/octet-stream");
      }
    }
    next();
  },
  express.static(path.join(__dirname, "../public/display")),
);
app.use(express.static(path.join(__dirname, "../public")));
app.use("/uploads", express.static(uploadDirectory));
app.use("/outputs", express.static(outputDirectory));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

app.get("/server", (req, res) => {
  res.sendFile(path.join(__dirname, "./private/index.html"));
});

app.post("/upload", upload.single("photo"), async (req, res) => {
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: "No file uploaded" });
    }

    const absoluteUserImagePath = path.join(uploadDirectory, req.file.filename);

    const userImageURL = `${PUBLIC_BASE_URL}/uploads/${req.file.filename}`;

    const selectedPathRelative = req.body.selectedImagePath.startsWith("/")
      ? req.body.selectedImagePath.slice(1)
      : req.body.selectedImagePath;

    const selectedImagePath = `${PUBLIC_BASE_URL}/${selectedPathRelative}`;

    let userRole = req.body.userRole;
    if (!userRole || userRole === "undefined" || userRole === "null") {
      userRole = "source";
    }
    const userSocketId = req.body.socketId || null;
    const consentAccepted = req.body.consentAccepted === "true";
    const currentYear = new Date().getFullYear();
    const artYear = parseInt(req.body.artYear, 10) || currentYear;

    let sourcePath, targetPath;

    if (userRole === "target") {
      sourcePath = selectedImagePath;
      targetPath = absoluteUserImagePath;
    } else {
      sourcePath = absoluteUserImagePath;
      targetPath = selectedImagePath;
    }

    const logId = await insertPlayerLog({
      playerId: userSocketId || `ANON_${Date.now()}`,
      selectedArt: selectedPathRelative,
      consentAccepted: consentAccepted,
      swapMode: userRole === "target" ? "past_to_present" : "present_to_past",
      resultImageUrl: null,
    });

    console.log(" Received Job:");
    console.log("- User Socket ID: ", userSocketId);
    console.log("- Source (User): ", sourcePath);
    console.log("- Target (Selected): ", targetPath);
    console.log("- User Photo to Delete Later: ", absoluteUserImagePath);

    const jobData = {
      logId: logId,
      sourcePath: sourcePath,
      targetPath: targetPath,
      uploadedUserPath: absoluteUserImagePath,
      userSocketId: userSocketId,
      userRole: userRole,
      artYear: artYear,
      timestamp: Date.now(),
    };

    io.emit("process_roop", jobData);

    return res.json({
      success: true,
      message: "Job accepted successfully",
      data: jobData,
    });
  } catch (error) {
    console.error("Error during file upload: ", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

io.on("connection", (socket) => {
  console.log("Client connected: ", socket.id);

  const referer = socket.handshake.headers.referer || "";
  if (referer.includes("/display")) {
    socket.join("unity_screens");
    console.log(
      ` WebGL Browser (${socket.id}) auto-joined 'unity_screens' room via /display URL!`,
    );
  }

  socket.on("register_unity", () => {
    socket.join("unity_screens");
    console.log(` Unity Client registered to 'unity_screens': ${socket.id}`);
  });

  socket.on("image", (data) => {
    console.log("Received image data:", data);
  });

  socket.on("start_swap", (data) => {
    console.log(" Triggering process_roop manually");
    io.emit("process_roop", data);
  });

  socket.on("roop_completed", async (result) => {
    console.log("roop_completed received with data: ", result);

    const userPhotoPath = result.uploadedUserPath;

    if (userPhotoPath) {
      if (fs.existsSync(userPhotoPath)) {
        fs.unlink(userPhotoPath, (error) => {
          if (error) {
            console.error("Failed to delete user temp photo: ", error);
          } else {
            console.log("Deleted temporary user photo: ", userPhotoPath);
          }
        });
      } else {
        console.warn("File to delete not found at path: ", userPhotoPath);
      }
    } else {
      console.warn("No 'uploadedUserPath' provided in roop_completed result!");
    }

    if (result.success) {
      const fullImageURL = result.imageURL;

      if (result.logId) {
        await updateResultImageUrl(result.logId, fullImageURL);
        console.log(
          ` Updated DB Record ID ${result.logId} with Image URL: ${fullImageURL}`,
        );
      }

      console.log(
        " Processing finished! Sending Image URL to Unity: ",
        fullImageURL,
      );

      let userRole = result.userRole;
      if (!userRole || userRole === "undefined" || userRole === "null") {
        userRole = "source";
      }
      const currentYear = new Date().getFullYear();
      const artYear = parseInt(result.artYear, 10) || currentYear;

      const payload = {
        imageURL: fullImageURL,
        userSocketId: result.userSocketId,
        userRole: userRole,
        artYear: artYear,
      };

      io.to("unity_screens").emit("display_on_unity", payload);
      console.log(` Target User Socket ID: ${result.userSocketId}`);

      if (result.userSocketId) {
        io.to(result.userSocketId).emit("your_result_ready", payload);
        io.emit("result_updated_global", payload);
      } else {
        console.warn(" No userSocketId found, broadcasting to all clients...");
        io.emit("your_result_ready", payload);
      }
    } else {
      console.error(" Roop processing failed: ", result.error);

      if (result.userSocketId) {
        io.to(result.userSocketId).emit("roop_failed", { error: result.error });
      } else {
        io.emit("roop_failed", { error: result.error });
      }
    }
  });

  socket.on("disconnect", () => {
    console.log(" Client disconnected: ", socket.id);
  });
});

app.get("/logs", async (req, res) => {
  const logs = await getAllLogs();
  res.json({ success: true, data: logs });
});

server.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
  console.log(`Public base URL: ${PUBLIC_BASE_URL}`);
});
