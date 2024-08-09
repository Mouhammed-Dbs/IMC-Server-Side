const express = require("express");
const router = express.Router();
const sessionController = require("../controllers/sessionController");

router.post("/create", sessionController.createSession);
router.post("/:sessionId/add-message", sessionController.addMessage);
router.post(
  "/:sessionId/update-association-symptoms",
  sessionController.updateAssociationSymptomsByUser
);
router.get("/", sessionController.getUserSessions);
router.get("/:sessionId", sessionController.getSession);

module.exports = router;
