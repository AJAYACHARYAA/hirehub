const mongoose = require('mongoose');
require('dotenv').config();

console.log('🔍 Testing MongoDB Connection...');
console.log('Connection string:', process.env.MONGO_URI ? '✓ Present' : '✗ Missing');

if (!process.env.MONGO_URI) {
  console.log('\n⚠️ No MongoDB URI found. Running in demo mode is fine!');
  process.exit(0);
}

// Hide password in logs
const hidePassword = (uri) => {
  return uri.replace(/\/\/(.*):(.*)@/, '//***:***@');
};
console.log('Connecting to:', hidePassword(process.env.MONGO_URI));

async function testConnection() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ MongoDB Connected Successfully!');
    
    // Test write operation
    const testSchema = new mongoose.Schema({ 
      name: String, 
      createdAt: { type: Date, default: Date.now } 
    });
    const Test = mongoose.model('Test', testSchema);
    
    await Test.create({ name: 'Connection Test' });
    console.log('✅ Test document created');
    
    const count = await Test.countDocuments();
    console.log(`📊 Test documents: ${count}`);
    
    await mongoose.connection.dropCollection('tests');
    console.log('✅ Cleanup complete');
    
    await mongoose.disconnect();
    console.log('✅ All tests passed! MongoDB is working!');
    
  } catch (error) {
    console.error('❌ MongoDB Error:', error.message);
    console.log('\n💡 Troubleshooting:');
    console.log('1. Check if username/password is correct');
    console.log('2. Check if IP whitelist includes your IP');
    console.log('3. Consider using local MongoDB instead');
    console.log('\n✅ Your app will still work in DEMO MODE without MongoDB');
  }
}

testConnection();