const detail = [
    {
      "loc": ["body", "email"],
      "msg": "value is not a valid email address",
      "type": "value_error.email"
    }
  ];
console.log(typeof detail);
console.log(Array.isArray(detail));
console.log(typeof detail === "string" ? detail : Array.isArray(detail) ? detail[0].msg : "Gagal");
