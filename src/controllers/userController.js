const User = require("../models/User");
const jwt = require("jsonwebtoken");

const getInfoUser = async (req, res) => {
  try {
    const token = req.headers.authorization.split(" ")[1];
    jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
      if (err) {
        res.status(401).json({
          error: true,
          message: "JWT is invalid!!",
        });
      } else {
        const userId = decoded.userId;
        const user = await User.findOne({ _id: userId });
        if (user) {
          return res.status(200).json({
            error: false,
            message: "Get info user successfully!",
            data: {
              user: {
                name: user.name,
                username: user.username,
                email: user.email,
                age: user.age,
                gender: user.gender,
              },
            },
          });
        }
        res.status(400).json({ error: true, message: "User Not Found!!" });
      }
    });
  } catch (error) {
    if (error.message.includes("duplicate key"))
      res.status(409).json({
        error: true,
        message: "User already exist!!",
      });
    else if (error.message.includes("Path"))
      res.status(409).json({
        error: true,
        message: "Invalid data!!",
      });
    else
      res.status(409).json({
        error: true,
        message: "Error!!",
      });
  }
};

module.exports = { getInfoUser };
