module.exports = async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Method not allowed." });
  }

  const { username } = request.query;
  if (typeof username !== "string") {
    return response.status(400).json({ error: "Enter a valid GitHub username." });
  }

  try {
    const { getProfileReport } = await import("../../server/src/github.js");
    const report = await getProfileReport(username);
    return response.status(200).json(report);
  } catch (error) {
    const status = Number.isInteger(error.status) ? error.status : 500;
    return response.status(status).json({
      error: error.message || "Unable to load this GitHub profile.",
    });
  }
};
