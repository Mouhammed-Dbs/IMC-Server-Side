const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");

router.get("/info-user", userController.getInfoUser);

module.exports = router;
