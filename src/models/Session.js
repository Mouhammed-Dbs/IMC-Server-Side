const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const sessionSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, required: true },
  doctorId: { type: Schema.Types.ObjectId, required: true },
  order: { type: Number, required: true },
  finished: { type: Boolean, required: true, default: false },
  progress: { type: Number, required: true, default: 0 },
  messages: [
    {
      sender: { type: String, enum: ["user", "ai"], required: true },
      content: { type: String, required: true },
      timestamp: { type: Date, default: Date.now() },
    },
  ],
  startDate: { type: Date, default: Date.now() },
  endDate: { type: Date, default: null },
});

const Session = mongoose.model("Session", sessionSchema);

module.exports = Session;
