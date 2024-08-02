const ApiError = require("../utils/ApiError");

const errorHandler = (err, req, res, next) => {
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      error: true,
      status: err.status,
      message: err.message,
    });
  } else {
    console.error("ERROR 💥:", err);
    res.status(500).json({
      error: true,
      status: "error",
      message: "Something went wrong!",
    });
  }
};

module.exports = errorHandler;
