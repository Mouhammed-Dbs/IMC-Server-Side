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
    const mySymptoms = new Array();
    extractedSymptomsRes.symptoms.map((symptom) =>
      mySymptoms.push({
        name: symptom.name,
        label: symptom.label,
        selected: -1,
        association: 0,
        associationByAI: symptom.prob,
      })
    );
    session.extractedSymptoms = mySymptoms;
    await session.save();
    return res.status(201).json({
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
    });
    // return next(new ApiError("We can't generate next question!!", 500));
  } else if (type === "sent") {
    nextForIdQue = true;
    session.messages.push({ sender: "ai", content: result, idQue: progress });
    progress += 1;

    if (
      progress <=
      limits.firstStageLimit +
        limits.secondStageLimit[
          session.currentDisorder < 0 ? 1 : session.currentDisorder
        ] +
        limits.thirdStageLimit[
          session.currentDisorder < 0 ? 1 : session.currentDisorder
        ]
    ) {
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
    }
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
      session.endDate = new Date().toISOString();
    } else {
      session.stage = 2;
    }
  } else if (
    numQue ==
      limits.firstStageLimit +
        limits.secondStageLimit[session.currentDisorder] &&
    type != "seq"
  ) {
    session.stage = 3;
  } else if (
    numQue ==
      limits.firstStageLimit +
        limits.secondStageLimit[session.currentDisorder] +
        limits.thirdStageLimit[session.currentDisorder] &&
    type != "seq"
  ) {
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
    const mySymptoms = new Array();
    extractedSymptomsRes.symptoms.map((symptom) =>
      mySymptoms.push({
        name: symptom.name,
        label: symptom.label,
        selected: -1,
        association: 0,
        associationByAI: symptom.prob,
      })
    );
    session.extractedSymptoms = mySymptoms;
    console.log(mySymptoms);
    console.log(extractSymptoms);
  }
  session.nextForIdQue = nextForIdQue;

  if (session.stage == 1 && session.finished == false)
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

  await session.save();
  console.log({
    stage: session.stage,
    progress: session.progress,
    finished: session.finished,
    numQue,
    type,
    extractSymptoms: session.extractedSymptoms,
    currentDisorder: session.currentDisorder,
  });
  res.status(201).json({
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
  });
});

const updateAssociationSymptomsByUser = asyncHandler(async (req, res, next) => {
  const { sessionId } = req.params;
  const { symptoms } = req.body; // Expecting [{label:2, association:0.6}, {label:7, association:0.2}]

  // Validate input
  if (!sessionId) {
    return next(new ApiError("Session ID is required", 400));
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

  if (!symptoms || !Array.isArray(symptoms)) {
    return next(new ApiError("Symptoms data must be an array", 400));
  }

  // Iterate over the symptoms and update each association in the array
  try {
    for (let symptom of symptoms) {
      const result = await Session.updateOne(
        { _id: sessionId, "extractedSymptoms.label": symptom.label },
        { $set: { "extractedSymptoms.$.association": symptom.association } }
      );

      if (result.nModified === 0) {
        // No matching document found, throw an error
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
    session.save();
    return res.status(200).json({
      error: false,
      msg: "Symptoms association updated successfully",
      data: {
        finished: session.finished,
      },
    });
  } catch (error) {
    return next(new ApiError("An error occurred while updating symptoms", 500));
  }
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
      extractedSymptoms: session.extractedSymptoms,
      currentDisorder: session.currentDisorder,
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
