function toCamelCase(obj) {
  if (Array.isArray(obj)) {
    return obj.map(toCamelCase);
  }
  if (obj !== null && typeof obj === 'object' && !(obj instanceof Date) && !(obj instanceof Buffer)) {
    return Object.keys(obj).reduce((acc, key) => {
      const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      acc[camelKey] = toCamelCase(obj[key]);
      return acc;
    }, {});
  }
  return obj;
}

function camelCaseResponse(req, res, next) {
  const originalJson = res.json.bind(res);
  res.json = function (body) {
    return originalJson(toCamelCase(body));
  };
  next();
}

module.exports = camelCaseResponse;
