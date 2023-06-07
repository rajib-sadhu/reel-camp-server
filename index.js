const express = require('express');
const app = express();

const port = process.env.PORT || 5000;





app.get('/', (req, res) => {

    res.send('Reel Camp Server Running');
});




app.listen(port, () => {
    console.log('Localhost Port:', port);
})