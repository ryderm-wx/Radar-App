const express = require("express");
const path = require("path");
const app = express();

// Serve static files from the project root directory
app.use(express.static(path.join(__dirname)));

// Define a route for the root URL
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
