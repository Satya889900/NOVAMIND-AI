const mongoose = require('c:\\Users\\LENOVO\\Desktop\\NovaMind AI\\backend\\node_modules\\mongoose');

async function run() {
  await mongoose.connect('mongodb://localhost:27017/novamind');
  console.log('Connected to MongoDB');

  // Query all users
  const users = await mongoose.connection.db.collection('users').find({}).toArray();
  console.log('--- USERS ---');
  users.forEach(u => {
    console.log(`ID: ${u._id}, Name: ${u.name}, Email: ${u.email}`);
  });

  await mongoose.disconnect();
}

run().catch(console.error);
