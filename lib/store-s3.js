const { S3Client, PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const streamToString = async (stream) => {
  return await new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on("error", (err) => reject(err));
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
};

function makeClient() {
  const region = process.env.AWS_REGION;
  if (!region) return null;
  return new S3Client({ region });
}

async function putJson(key, obj) {
  const client = makeClient();
  if (!client) throw new Error("AWS_REGION not configured");
  const bucket = process.env.AWS_S3_BUCKET;
  if (!bucket) throw new Error("AWS_S3_BUCKET not configured");
  const body = JSON.stringify(obj);
  const cmd = new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: "application/json" });
  await client.send(cmd);
}

async function getJson(key) {
  const client = makeClient();
  if (!client) throw new Error("AWS_REGION not configured");
  const bucket = process.env.AWS_S3_BUCKET;
  if (!bucket) throw new Error("AWS_S3_BUCKET not configured");
  try {
    const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
    const resp = await client.send(cmd);
    const body = await streamToString(resp.Body);
    return JSON.parse(body);
  } catch (err) {
    if (err.name === "NoSuchKey" || err.$metadata?.httpStatusCode === 404) return null;
    throw err;
  }
}

module.exports = { putJson, getJson };
