const axios = require("axios");

exports.generateQues = async (
  idQues,
  userRes = "",
  idDisorder = "1",
  typeQues = "ar"
) => {
  try {
    const response = await axios.post(
      `${process.env.DEV_AI_SERVER_BASE_URL}generateQues/${typeQues}/${idQues}?idDisorder=${idDisorder}`,
      { userRes },
      { headers: { Authorization: `Bearer ${process.env.API_KEY}` } }
    );
    const result = response.data;
    return result.data;
  } catch (err) {
    console.error("Error generating question:", err);
  }
  return null;
};

exports.predictDisorderForFirstStage = async (userAns) => {
  try {
    const response = await axios.post(
      `${process.env.DEV_AI_SERVER_BASE_URL}predictDisorderForFirstStage`,
      { userAns },
      { headers: { Authorization: `Bearer ${process.env.API_KEY}` } }
    );
    const result = response.data;
    if (!result.error) return result.data;
  } catch (err) {
    console.error("Error predict disorder for first stage:", err);
  }
  return null;
};

exports.extractSymptoms = async (userAns, idDisorder) => {
  try {
    const response = await axios.post(
      `${process.env.DEV_AI_SERVER_BASE_URL}extractSymptoms?idDisorder=${idDisorder}`,
      { userAns },
      { headers: { Authorization: `Bearer ${process.env.API_KEY}` } }
    );
    const result = response.data;
    if (!result.error) return result.data;
  } catch (err) {
    console.error("Error extract symptoms", err);
  }
  return null;
};

exports.getLimits = async () => {
  try {
    const response = await axios.get(
      `${process.env.DEV_AI_SERVER_BASE_URL}stageLimits`,
      { headers: { Authorization: `Bearer ${process.env.API_KEY}` } }
    );
    const result = response.data;
    if (!result.error) return result.data;
  } catch (err) {
    console.error("Error get stage limits", err);
  }
  return null;
};
