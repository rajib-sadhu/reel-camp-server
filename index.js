require('dotenv').config()
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const express = require('express');
const app = express();
const cors = require('cors')
const port = process.env.PORT || 5000;
const jwt = require('jsonwebtoken');

const stripe = require('stripe')(process.env.PAYMENT_SECRET_KEY);

// middleware
app.use(cors());
app.use(express.json());

const verifyJwt = (req, res, next) => {
  const authorization = req.headers.authorization;

  if (!authorization) {
    return res.status(401).send({ error: true, message: 'unauthorized access' })
  }

  // bearer token
  const token = authorization.split(' ')[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (error, decoded) => {
    if (error) {
      return res.status(401).send({ error: true, message: 'unauthorized access' })
    }
    req.decoded = decoded;
    next();
  })
}


var uri = `mongodb://${process.env.DB_USER}:${process.env.DB_PASSWORD}@ac-kodbbia-shard-00-00.6iqnpnz.mongodb.net:27017,ac-kodbbia-shard-00-01.6iqnpnz.mongodb.net:27017,ac-kodbbia-shard-00-02.6iqnpnz.mongodb.net:27017/?ssl=true&replicaSet=atlas-12qn8w-shard-0&authSource=admin&retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    client.connect();

    // Collections
    const classesCollection = client.db('reelCamp').collection('classes');
    const usersCollection = client.db('reelCamp').collection('users');
    const selectClassesCollection = client.db('reelCamp').collection('selectClasses');
    const paymentCollection = client.db('reelCamp').collection('payment');



    //verifyAdmin
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);

      if (user?.role !== 'admin') {
        return res.status(403).send({ error: true, message: 'forbidden access' })
      }
      next();
    };

    // Verify Instructor
    const verifyInstructor = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      if (user?.role !== 'instructor') {
        return res.status(403).send({ error: true, message: 'forbidden access' })
      }
      next();
    };

    // Check JWT
    app.post('/jwt', (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
      res.send({ token });
    })

    // Users API

    app.get('/user/info', verifyJwt, async (req, res) => {

      const email = req.query.email;

      const query = { email: email };
      const result = await usersCollection.findOne(query);
      res.send(result);

    });


    app.post('/users', async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: 'User already exists' })
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    // User Admin
    app.get('/users', verifyJwt, verifyAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    app.delete('/users/:id', async (req, res) => {
      const id = req.params.id;
      console.log('delete users', id)
      const query = { _id: new ObjectId(id) }
      const result = await usersCollection.deleteOne(query);
      res.send(result);
    });


    app.get('/users/admin/:email', verifyJwt, async (req, res) => {
      const email = req.params.email;
      if (req.decoded.email !== email) {
        return res.send({ admin: false })
      }
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const result = { admin: user?.role === 'admin' };
      res.send(result);
    })

    app.patch('/users/admin/:id', verifyJwt, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const userRole = req.query.role;
      const filter = { _id: new ObjectId(id) };
      const updateRole = {
        $set: {
          role: userRole
        }
      }
      const result = await usersCollection.updateOne(filter, updateRole);
      res.send(result);
    });

    app.patch('/classes/admin/status/:id', verifyJwt, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const status = req.query.status;
      // console.log(id, status)
      const filter = { _id: new ObjectId(id) };
      const updateStatus = {
        $set: {
          instructorStatus: status
        }
      }
      const result = await classesCollection.updateOne(filter, updateStatus);
      res.send(result);
    });

    app.patch('/classes/admin/feedback/:id', async (req, res) => {
      const id = req.params.id;
      const { feedback } = req.body;
      // console.log(id, feedback);
      const filter = { _id: new ObjectId(id) };
      const updateFeedback = {
        $set: {
          adminFeedback: feedback
        }
      }
      const result = await classesCollection.updateOne(filter, updateFeedback);
      res.send(result);
    });




    // Instructor API
    app.get('/instructor', async (req, res) => {
      const project = { projection: { name: 1, email: 1, photoURL: 1 } }
      const result = await usersCollection.find({ role: 'instructor' }, project).toArray();
      res.send(result);

    })

    app.get('/users/instructor/:email', verifyJwt, async (req, res) => {
      const email = req.params.email;
      // console.log(email)
      if (req.decoded.email !== email) {
        return res.send({ instructor: false })
      }
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const result = { instructor: user?.role === 'instructor' };
      res.send(result);
    });

    app.get('/instructor/myClass', verifyJwt, verifyInstructor, async (req, res) => {

      const email = req.query.email;
      const filter = { instructorEmail: email };
      const result = await classesCollection.find(filter).toArray();
      res.send(result);
    })



    // Classes API
    app.get('/classes', async (req, res) => {
      const filter = { instructorStatus: 'active' };
      const result = await classesCollection.find(filter).toArray();
      res.send(result)
    });

    app.post('/classes', verifyJwt, verifyInstructor, async (req, res) => {
      const newItem = req.body;
      const result = await classesCollection.insertOne(newItem);
      res.send(result)
    });

    app.get('/classes/check', verifyJwt, verifyAdmin, async (req, res) => {
      const result = await classesCollection.find().toArray();
      res.send(result)
    })




    // Select Classes API
    app.get('/selectClasses', verifyJwt, async (req, res) => {
      const email = req.query.email;
      if (!email) {
        res.send([]);
      }

      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res.status(401).send({ error: true, message: 'forbidden access' })
      }
      const query = { email: email }
      const result = await selectClassesCollection.find(query).toArray();
      res.send(result);
    });

    app.post('/selectClasses', async (req, res) => {
      const item = req.body;
      console.log(item);
      const result = await selectClassesCollection.insertOne(item);
      res.send(result);
    });

    app.delete('/selectClasses/:id', async (req, res) => {
      const id = req.params.id;
      console.log(id);
      const query = { _id: new ObjectId(id) }
      const result = await selectClassesCollection.deleteOne(query);
      res.send(result);
    });




    // create payment intent
    app.post('/create-payment-intent', verifyJwt, async (req, res) => {
      const { price } = req.body;
      const amount = price * 100;
      // console.log(price, amount)
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'inr',
        payment_method_types: ['card']
      })
      res.send({
        clientSecret: paymentIntent.client_secret
      })
    })


    //Payments Api
    app.get('/payments', verifyJwt, async (req, res) => {

      const email = req.query.email;
      const query = { email: email };
      const result = await paymentCollection.find(query).sort({ date: -1 }).toArray();
      res.send(result);

    })

    app.post('/payments/:id', verifyJwt, async (req, res) => {

      const id = req.params.id;
      const payment = req.body;
      const classId = req.query.classId;

      const backendHit = { classId: classId, cartId: id, paymentData: payment }

      // console.log(backendHit)

      const queryDelete = { _id: new ObjectId(id) };
      const queryClassId = { _id: new ObjectId(classId) };
      const getClass = await classesCollection.findOne(queryClassId);
      const availableSeats = getClass.availableSeats;
      const enrolled = getClass.enrolled;
      
      let setEnroll = '';
      if (!enrolled) {
        setEnroll = 1;
      }
      else {
        setEnroll = enrolled + 1;
      }
      
      const updateClass = {
        $set: {
          availableSeats: availableSeats - 1,
          enrolled: setEnroll
        }
      };
      

      const updateClassResult = await classesCollection.updateOne(queryClassId,updateClass);
      
      const insertResult = await paymentCollection.insertOne(payment);
      const deleteResult = await selectClassesCollection.deleteOne(queryDelete);

      res.send({
        insertResult,
        deleteResult,
        updateClassResult
      });
    });



    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);







app.get('/', (req, res) => {

  res.send('Reel Camp Server Running');
});

app.listen(port, () => {
  console.log('Localhost Port:', port);
})