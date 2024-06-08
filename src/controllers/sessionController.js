const jwt = require("jsonwebtoken");
const Session = require("../models/Session");
const Doctor = require("../models/Doctor");
const axios = require("axios");
const User = require("../models/User");

generateQuesForFirstStage = async (idQues, typeQues) => {
  try {
    const res = await axios.get(
      `${process.env.AI_SERVER_BASE_URL}generateQuesForFirstStage/${typeQues}/${idQues}`,
      { headers: { Authorization: `Bearer ${process.env.API_KEY}` } }
    );
    const result = res.data;
    if (!result.error) return result.data;
  } catch (err) {
    return null;
  }
  return null;
};

createSession = async (req, res) => {
  const { doctorId, typeQues } = req.body;
  if (!doctorId)
    return res
      .status(400)
      .json({ error: true, message: "doctorId is required!" });
  if (!typeQues)
    return res
      .status(400)
      .json({ error: true, message: "typeQues is required!" });
  const token = req.headers.authorization.split(" ")[1];
  jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
    if (err) {
      res.status(401).json({
        error: true,
        message: "JWT is invalid!!".concat(err),
      });
    } else {
      const doctors = await Doctor.find({ _id: doctorId });
      if (doctors.length === 0)
        return res
          .status(400)
          .json({ error: true, message: "doctorId is not found!" });
      const userId = decoded.userId;
      const user = await User.findOne({ _id: userId });
      if (!user)
        return res
          .status(400)
          .json({ error: true, message: "User is not found!" });
      const sessions = await Session.find({ userId });
      let numFinished = 0;
      if (sessions.length > 0) {
        sessions.forEach((session) => {
          if (session.finished) numFinished += 1;
        });
      }
      if (numFinished === sessions.length) {
        const newSession = new Session({
          userId,
          doctorId: "" + doctorId,
          order: sessions.length + 1,
        });
        try {
          const tempMessage = await generateQuesForFirstStage(1, typeQues);
          if (!tempMessage)
            return res.status(500).json({
              error: true,
              message: "We can't generate first question!!",
            });
          const session = await newSession.save();
          const user = await User.findOne({ _id: userId });
          const message =
            tempMessage.split("_")[0] +
            ` ${user.name} ` +
            tempMessage.split("_")[1];
          session.messages.push({ sender: "ai", content: message });
          await Session.findOneAndUpdate(
            { _id: session._id },
            { $set: { messages: session.messages } },
            { new: true }
          );
          res.status(201).json({
            error: false,
            message: "Session created!",
            data: { sessionId: session._id },
          });
        } catch (error) {
          if (error.message.includes("duplicate key"))
            res.status(409).json({
              error: true,
              message: "Session already created!!",
            });
          else if (error.message.includes("Path"))
            res.status(409).json({
              error: true,
              message: "Invalid data!!",
            });
          else if (
            error.message.includes(
              "Session validation failed: doctorId: Cast to ObjectId"
            )
          )
            res.status(500).json({
              error: true,
              message: "doctorId is ObjectId!!",
            });
          else
            res.status(500).json({
              error: true,
              message: "Error!!" + error,
            });
        }
      } else {
        res.status(409).json({
          error: true,
          message: "You already have an opened session!",
        });
      }
    }
  });
};

addMessage = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { message } = req.body;
    if (!message)
      return res
        .status(400)
        .json({ error: true, message: "Message is required!" });
    if (!sessionId)
      return res
        .status(400)
        .json({ error: true, message: "sessionId is required!" });
    const token = req.headers.authorization.split(" ")[1];
    jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
      if (err) {
        res.status(401).json({
          error: true,
          message: "JWT is invalid!!",
        });
      } else {
        const userId = decoded.userId;
        const session = await Session.findOne({ _id: sessionId });
        if (session) {
          if (session.userId != userId) {
            return res.status(401).json({
              error: true,
              message: "This session is not for you!!",
            });
          }
          session.messages.push({ sender: "user", content: message });
          const data = await Session.findOneAndUpdate(
            { _id: sessionId },
            { $set: { messages: session.messages } },
            { new: true }
          );
          return res.status(201).json({
            error: false,
            message: "Message added",
            data: { progress: data.progress, finished: data.finished },
          });
        }
        res.status(400).json({ error: true, message: "Session Not Found!!" });
      }
    });
  } catch (error) {
    res.status(500).json({
      error: true,
      message: error.message,
    });
  }
};

getSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    if (!sessionId)
      return res
        .status(400)
        .json({ error: true, message: "sessionId is required!" });
    if (!req.headers.authorization)
      return res.status(401).json({
        error: true,
        message: "JWT is required!!",
      });
    const token = req.headers.authorization.split(" ")[1];
    jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
      if (err) {
        res.status(401).json({
          error: true,
          message: "JWT is invalid!!",
        });
      } else {
        const userId = decoded.userId;
        const session = await Session.findOne({ _id: sessionId });
        if (session) {
          if (session.userId != userId) {
            return res.status(401).json({
              error: true,
              message: "This session is not for you!!",
            });
          }
          return res.status(200).json({
            error: false,
            message: "Success!",
            data: {
              progress: session.progress,
              finished: session.finished,
              startTime: session.startTime,
              messages: session.messages,
            },
          });
        }
        res.status(400).json({ error: true, message: "Session Not Found!!" });
      }
    });
  } catch (error) {
    res.status(500).json({
      error: true,
      message: error.message,
    });
  }
};

getUserSessions = async (req, res) => {
  try {
    if (!req.headers.authorization)
      return res.status(401).json({
        error: true,
        message: "JWT is required!!",
      });
    const token = req.headers.authorization.split(" ")[1];
    jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
      if (err) {
        res.status(401).json({
          error: true,
          message: "JWT is invalid!!",
        });
      } else {
        const userId = decoded.userId;
        const sessions = await Session.find({ userId });
        let data = await Promise.all(
          sessions.map(async (session) => {
            let doctor = await Doctor.findById(session.doctorId);
            return {
              id: session._id,
              order: session.order,
              doctorName: doctor.name,
              statusFinished: session.finished,
              progress: session.progress,
              creationDate: session.startDate,
              finishingDate: session.endDate,
            };
          })
        );
        res.status(200).json({
          error: false,
          message: "Success!",
          data,
        });
      }
    });
  } catch (error) {
    res.status(500).json({
      error: true,
      message: error.message,
    });
  }
};

module.exports = { createSession, addMessage, getSession, getUserSessions };
