
const regex = /^(\+91|91)?[6-9]\d{9}$/;

const testInputs = [
  '+919876543210',
  '919876543210',
  '9876543210',
  '+91 9876543210',
  '09876543210',
  '+91987654321', // 9 digits after prefix
  '+9198765432101', // 11 digits after prefix
];

testInputs.forEach(input => {
  const result = regex.test(input.trim());
  console.log(`INPUT: "${input}" -> ${result ? 'PASS' : 'FAIL'}`);
});
