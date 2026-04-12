const express = require('express');
const app = express();
const PORT = 3005;
app.listen(PORT, () => {
  console.log('Minimal server listening on ' + PORT);
});
console.log('Script execution reached end');
