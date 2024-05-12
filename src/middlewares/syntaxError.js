exports.error = (err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    res.status(400).json({ error: true, message: "Invalid JSON syntax" });
  } else {
    next();
  }
};
