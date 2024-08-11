const jwt = require("jsonwebtoken");
const asyncHandler = require("express-async-handler");
const Session = require("../models/Session");
const Doctor = require("../models/Doctor");
const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const {
  generateQues,
  predictDisorderForFirstStage,
  extractSymptoms,
  getLimits,
} = require("../utils/AI/api");

// Helper Functions
const extractToken = (authorizationHeader) => {
  if (!authorizationHeader)
    throw new ApiError("Authorization token is required", 401);
  return authorizationHeader.split(" ")[1];
};

const verifyToken = (token) => {
  return new Promise((resolve, reject) => {
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
      if (err) reject(new ApiError("JWT is invalid!", 401));
      else resolve(decoded);
    });
  });
};

const verifyUser = async (token) => {
  const decoded = await verifyToken(token);
  return decoded.userId;
};

const findSession = async (sessionId, userId) => {
  const session = await Session.findById(sessionId);
  if (!session || session.userId.toString() !== userId) {
    throw new ApiError(
      session ? "This session is not for you!" : "Session Not Found!",
      401
    );
  }
  return session;
};

const getProgress = (messages) => {
  return messages.filter((msg) => msg.sender === "ai-base").length;
};

const extractUserAnswers = (messages) => {
  return messages
    .filter((msg) => msg.sender === "user")
    .map((item) => ({
      content: item.content,
      idQue: item.idQue,
    }));
};

const predictDisorder = async (userAns) => {
  const predictRes = await predictDisorderForFirstStage(userAns);
  return predictRes.disorderLabel;
};

const getDisorderStage = (currentDisorder) => {
  return currentDisorder < 0 ? "1" : currentDisorder;
};

const handleGeneratedQuestion = async (
  session,
  type,
  result,
  progress,
  limits
) => {
  switch (type) {
    case "unknown":
      await handleUnknownType(session, limits);
      break;
    case "sent":
      await handleSentType(session, result, progress, limits);
      break;
    case "que":
      session.messages.push({
        sender: "ai-base",
        content: result,
        idQue: progress + 1,
      });
      break;
    case "seq":
      session.messages.push({
        sender: "ai",
        content: result,
        idQue: progress,
      });
      break;
    default:
      throw new ApiError("Invalid question type", 500);
  }
};

const handleUnknownType = async (session, limits) => {
  session.stage = 4;

  const userAns = session.messages
    .filter(
      (msg) => msg.sender === "user" && msg.idQue > limits.firstStageLimit
    )
    .map((item) => item.content);

  const extractedSymptomsRes = await extractSymptoms(
    userAns,
    session.currentDisorder
  );
  session.extractedSymptoms = extractedSymptomsRes.symptoms.map((symptom) => ({
    name: symptom.name,
    label: symptom.label,
    selected: -1,
    association: 0,
    associationByAI: symptom.prob,
  }));
};

const handleSentType = async (session, result, progress, limits) => {
  session.messages.push({
    sender: "ai",
    content: result,
    idQue: progress,
  });
  progress += 1;
  if (progress <= getMaxProgressLimit(limits, session.currentDisorder)) {
    session.currentDisorder = await predictDisorder(
      extractUserAnswers(session.messages)
    );
    const newRes = await generateQues(
      progress,
      "",
      getDisorderStage(session.currentDisorder),
      session.typeQues
    );
    session.messages.push({
      sender: "ai-base",
      content: newRes.result,
      idQue: progress,
    });
  }
};

const getMaxProgressLimit = (limits, currentDisorder) => {
  return (
    limits.firstStageLimit +
    limits.secondStageLimit[currentDisorder < 0 ? "1" : currentDisorder] +
    limits.thirdStageLimit[currentDisorder < 0 ? "1" : currentDisorder]
  );
};

const shouldProceedToNextQue = (type) => {
  return type === "sent" || type === "que";
};

const updateProgress = (session, progress, limits) => {
  const calculateProgress = (progress, limit, stage) => {
    return Math.round(((progress * 25 * stage) / limit) * 10) / 10;
  };

  switch (session.stage) {
    case 1:
      session.progress = calculateProgress(
        progress,
        limits.firstStageLimit,
        session.stage
      );
      break;
    case 2:
      session.progress = calculateProgress(
        progress,
        limits.firstStageLimit +
          limits.secondStageLimit[
            session.currentDisorder < 0 ? 1 : session.currentDisorder
          ],
        session.stage
      );
      break;
    case 3:
      session.progress = calculateProgress(
        progress,
        getMaxProgressLimit(limits, session.currentDisorder),
        session.stage
      );
      break;
    default:
      session.progress = 100;
  }
};

const createResponseObjectForAddMessage = (session) => {
  return {
    error: false,
    message: "Message added",
    data: {
      stage: session.stage,
      progress: session.progress,
      finished: session.finished,
      messages: session.messages,
      extractedSymptoms: session.extractedSymptoms,
      currentDisorder: session.currentDisorder,
    },
  };
};

// Controller Functions
const createSession = asyncHandler(async (req, res, next) => {
  const { doctorId, typeQues } = req.body;

  if (!doctorId || !typeQues) {
    return next(new ApiError("doctorId and typeQues are required!", 400));
  }

  const token = extractToken(req.headers.authorization);
  const userId = await verifyUser(token);

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
    session.messages.push({
      sender: "ai-base",
      content: message,
      idQue: 1,
    });

    await session.save();
    res.status(201).json({
      error: false,
      message: "Session created!",
      data: {
        sessionId: session._id,
      },
    });
  } else {
    next(new ApiError("You already have an opened session!", 409));
  }
});

const addMessage = asyncHandler(async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const { message } = req.body;

    if (!message || !sessionId) {
      throw new ApiError("Message and sessionId are required!", 400);
    }

    const token = extractToken(req.headers.authorization);
    const userId = await verifyUser(token);

    const session = await findSession(sessionId, userId);
    let progress = getProgress(session.messages);
    const limits = await getLimits();

    session.messages.push({
      sender: "user",
      content: message,
      idQue: progress,
    });

    const userAns = extractUserAnswers(session.messages);
    session.currentDisorder = await predictDisorder(userAns);

    const { type, result } = await generateQues(
      progress + 1,
      session.nextForIdQue ? message : "",
      getDisorderStage(session.currentDisorder),
      session.typeQues
    );

    await handleGeneratedQuestion(session, type, result, progress, limits);
    session.nextForIdQue = shouldProceedToNextQue(type);
    if (session.stage < 4) updateProgress(session, progress, limits);

    // تحديث المرحلة بناءً على عدد الأسئلة
    if (progress === limits.firstStageLimit && type !== "seq") {
      const predictRes = await predictDisorderForFirstStage(userAns);
      session.currentDisorder = predictRes.disorderLabel;

      if (predictRes.disorderLabel === 0) {
        session.finished = true;
        session.progress = 100;
        session.stage = 1;
        session.endDate = new Date().toISOString();
      } else {
        session.stage = 2;
      }
    } else if (
      progress ===
        limits.firstStageLimit +
          limits.secondStageLimit[
            session.currentDisorder < 0 ? "1" : session.currentDisorder
          ] &&
      type !== "seq"
    ) {
      session.stage = 3;
    } else if (
      progress ===
        limits.firstStageLimit +
          limits.secondStageLimit[session.currentDisorder] +
          limits.thirdStageLimit[session.currentDisorder] &&
      type !== "seq"
    ) {
      session.stage = 4;

      const symptomsAfterFirstStage = session.messages
        .filter(
          (msg) => msg.sender === "user" && msg.idQue > limits.firstStageLimit
        )
        .map((item) => item.content);

      const extractedSymptomsRes = await extractSymptoms(
        symptomsAfterFirstStage,
        session.currentDisorder
      );
      const mySymptoms = extractedSymptomsRes.symptoms.map((symptom) => ({
        name: symptom.name,
        label: symptom.label,
        selected: -1,
        association: 0,
        associationByAI: symptom.prob,
      }));

      session.extractedSymptoms = mySymptoms;
    }
    await session.save();
    res.status(201).json(createResponseObjectForAddMessage(session));
  } catch (error) {
    next(error);
  }
});

const updateAssociationSymptomsByUser = asyncHandler(async (req, res, next) => {
  const { sessionId } = req.params;
  const { symptoms } = req.body;

  if (!sessionId) {
    return next(new ApiError("Session ID is required", 400));
  }

  const token = extractToken(req.headers.authorization);
  const userId = await verifyUser(token);

  const session = await Session.findById(sessionId);
  if (!session || session.userId.toString() !== userId) {
    return next(
      new ApiError(
        session ? "This session is not for you!" : "Session Not Found!!",
        401
      )
    );
  }

  if (!symptoms || !Array.isArray(symptoms)) {
    return next(new ApiError("Symptoms data must be an array", 400));
  }

  try {
    for (let symptom of symptoms) {
      const result = await Session.updateOne(
        { _id: sessionId, "extractedSymptoms.label": symptom.label },
        { $set: { "extractedSymptoms.$.association": symptom.association } }
      );

      if (result.nModified === 0) {
        return next(
          new ApiError(
            `No matching symptom found for label: ${symptom.label}`,
            404
          )
        );
      }
    }
    session.finished = true;
    session.endDate = new Date().toISOString();
    session.progress = 100;
    await session.save();

    res.status(200).json({
      error: false,
      msg: "Symptoms association updated successfully",
      data: { finished: session.finished },
    });
  } catch (error) {
    next(new ApiError("An error occurred while updating symptoms", 500));
  }
});

const getSession = asyncHandler(async (req, res, next) => {
  const { sessionId } = req.params;

  if (!sessionId) {
    return next(new ApiError("sessionId is required!", 400));
  }

  const token = extractToken(req.headers.authorization);
  const userId = await verifyUser(token);

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
      extractedSymptoms: session.extractedSymptoms,
      currentDisorder: session.currentDisorder,
    },
  });
});

const getUserSessions = asyncHandler(async (req, res, next) => {
  const token = extractToken(req.headers.authorization);
  const userId = await verifyUser(token);

  const sessions = await Session.find({ userId });

  const data = await Promise.all(
    sessions.map(async (session) => {
      const doctor = await Doctor.findById(session.doctorId);
      return {
        id: session._id,
        order: session.order,
        doctorName: doctor.name,
        statusFinished: session.finished,
        stage: session.stage,
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

module.exports = {
  createSession,
  addMessage,
  updateAssociationSymptomsByUser,
  getSession,
  getUserSessions,
};
