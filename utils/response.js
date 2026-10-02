const success = (res, message = "Success", data = null, statusCode = 200) => {
  const body = { status: true, message };
  if (data !== null && data !== undefined) {
    body.data = data;
  }
  return res.status(statusCode).json(body);
};

const failure = (res, message = "Something went wrong", statusCode = 500, data = null) => {
  const body = { status: false, message };
  if (data !== null && data !== undefined) {
    body.data = data;
  }
  return res.status(statusCode).json(body);
};

module.exports = { success, failure };
