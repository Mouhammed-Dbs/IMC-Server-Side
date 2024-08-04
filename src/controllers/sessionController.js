const jwt = require("jsonwebtoken");
const asyncHandler = require("express-async-handler");
const Session = require("../models/Session");
const Doctor = require("../models/Doctor");
const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const {
  generateQues,
  predictDisorderForFirstStage,
} = require("../utils/AI/api");

const verifyToken = (token) => {
  return new Promise((resolve, reject) => {
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
      if (err) {
        reject(new ApiError("JWT is invalid!", 401));
      } else {
        resolve(decoded);
      }
    });
  });
};

const createSession = asyncHandler(async (req, res, next) => {
  const { doctorId, typeQues } = req.body;

  if (!doctorId || !typeQues) {
    return next(new ApiError("doctorId and typeQues are required!", 400));
  }

  const token = req.headers.authorization.split(" ")[1];
  const decoded = await verifyToken(token).catch(next);
  const userId = decoded.userId;

  const doctor = await Doctor.findById(doctorId);
  if (!doctor) {
    return next(new ApiError("doctorId is not found!", 400));
  }

  const user = await User.findById(userId);
  if (!user) {
    return next(new ApiError("User is not found!", 400));
  }

  const sessions = await Session.find({ userId });
  const numFinished = sessions.filter((session) => session.finished).length;

  if (numFinished === sessions.length) {
    const newSession = new Session({
      userId,
      doctorId: doctorId.toString(),
      typeQues,
      progress: 2.5,
      nextForIdQue: true,
      order: sessions.length + 1,
    });

    const { type, result } = await generateQues(1, "", "1", typeQues);
    if (!result) {
      return next(new ApiError("We can't generate first question!!", 500));
    }

    const session = await newSession.save();
    const message = `${result.split("_")[0]} ${user.name} ${
      result.split("_")[1]
    }`;
    session.messages.push({ sender: "ai-base", content: message, idQue: 1 });

    await session.save();
    res.status(201).json({
      error: false,
      message: "Session created!",
      data: { sessionId: session._id },
    });
  } else {
    next(new ApiError("You already have an opened session!", 409));
  }
});

const addMessage = asyncHandler(async (req, res, next) => {
  const { sessionId } = req.params;
  const { message } = req.body;

  if (!message || !sessionId) {
    return next(new ApiError("Message and sessionId are required!", 400));
  }

  const token = req.headers.authorization.split(" ")[1];
  const decoded = await verifyToken(token).catch(next);
  const userId = decoded.userId;

  const session = await Session.findById(sessionId);
  if (!session || session.userId.toString() !== userId) {
    return next(
      new ApiError(
        session ? "This session is not for you!" : "Session Not Found!!",
        401
      )
    );
  }

  let progress = session.messages.filter(
    (msg) => msg.sender === "ai-base"
  ).length;

  const numQue = progress;

  session.messages.push({ sender: "user", content: message, idQue: progress });

  let nextForIdQue = session.nextForIdQue;

  const { type, result, limits } = await generateQues(
    progress + 1,
    nextForIdQue ? message : "",
    session.currentDisorder < 0 ? "1" : session.currentDisorder,
    session.typeQues
  );

  if (type === "unknown") {
    await session.save();
    // return next(new ApiError("We can't generate next question!!", 500));
  } else if (type === "sent") {
    nextForIdQue = true;
    session.messages.push({ sender: "ai", content: result, idQue: progress });
    progress += 1;
    const newRes = await generateQues(
      progress,
      "",
      session.currentDisorder < 0 ? "1" : session.currentDisorder,
      session.typeQues
    );
    session.messages.push({
      sender: "ai-base",
      content: newRes.result,
      idQue: progress,
    });
  } else if (type === "que") {
    nextForIdQue = true;
    session.messages.push({
      sender: "ai-base",
      content: result,
      idQue: progress + 1,
    });
    progress += 1;
  } else if (type === "seq") {
    nextForIdQue = false;
    session.messages.push({ sender: "ai", content: result, idQue: progress });
  }

  if (numQue === limits.firstStageLimit && type != "seq") {
    const userAns = session.messages
      .filter((msg) => msg.sender === "user")
      .map((item) => item.content);
    const predictRes = await predictDisorderForFirstStage(userAns);
    session.currentDisorder = predictRes.disorderLabel;
    if (predictRes.disorderLabel == 0) {
      session.finished = true;
      session.progress = 100;
      session.stage = 1;
    } else {
      session.stage = 2;
    }
  } else if (
    numQue ==
    limits.firstStageLimit + limits.secondStageLimit[session.currentDisorder]
  ) {
    session.stage = 3;
  } else if (
    numQue ==
    limits.firstStageLimit +
      limits.secondStageLimit[session.currentDisorder] +
      limits.thirdStageLimit[session.currentDisorder]
  ) {
    session.stage = 4;
  }
  session.nextForIdQue = nextForIdQue;
  await session.save();

  if (session.stage == 1)
    session.progress =
      Math.round(((progress * 25) / limits.firstStageLimit) * 10) / 10;
  else if (session.stage == 2)
    session.progress =
      Math.round(
        ((progress * 25 * session.stage) /
          (limits.firstStageLimit +
            limits.secondStageLimit[session.currentDisorder])) *
          10
      ) / 10;
  else if (session.stage == 3)
    session.progress =
      Math.round(
        ((progress * 25 * session.stage) /
          (limits.firstStageLimit +
            limits.secondStageLimit[session.currentDisorder] +
            limits.thirdStageLimit[session.currentDisorder])) *
          10
      ) / 10;
  else console.log("Progress Survey");
  console.log({
    stage: session.stage,
    progress: session.progress,
    finished: session.finished,
    numQue,
  });
  res.status(201).json({
    error: false,
    message: "Message added",
    data: {
      stage: session.stage,
      progress: session.progress,
      finished: session.finished,
      messages: session.messages,
    },
  });
});

const getSession = asyncHandler(async (req, res, next) => {
  const { sessionId } = req.params;

  if (!sessionId) {
    return next(new ApiError("sessionId is required!", 400));
  }

  if (!req.headers.authorization) {
    return next(new ApiError("JWT is required!!", 401));
  }

  const token = req.headers.authorization.split(" ")[1];
  const decoded = await verifyToken(token).catch(next);
  const userId = decoded.userId;

  const session = await Session.findById(sessionId);
  if (!session || session.userId.toString() !== userId) {
    return next(
      new ApiError(
        session ? "This session is not for you!" : "Session Not Found!!",
        401
      )
    );
  }

  res.status(200).json({
    error: false,
    message: "Success!",
    data: {
      stage: session.stage,
      progress: session.progress,
      finished: session.finished,
      startTime: session.startTime,
      messages: session.messages,
    },
  });
});

const getUserSessions = asyncHandler(async (req, res, next) => {
  if (!req.headers.authorization) {
    return next(new ApiError("JWT is required!!", 401));
  }

  const token = req.headers.authorization.split(" ")[1];
  const decoded = await verifyToken(token).catch(next);
  const userId = decoded.userId;

  const sessions = await Session.find({ userId });

  const data = await Promise.all(
    sessions.map(async (session) => {
      const doctor = await Doctor.findById(session.doctorId);
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
});

module.exports = { createSession, addMessage, getSession, getUserSessions };
