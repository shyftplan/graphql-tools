// Decorators let you transform a GraphQL schema in lots and lots of cool ways!

class SchemaIterator {
  constructor(schema) {
    this.schema = schema;
  }

  // apply a function to each arg
  forEachArg(fn) {
    this.forEachField((field) => {
      if (field.args) {
        // curiously, args is an array, unlike type and field, which are maps.
        field.args.forEach(arg => fn(arg));
      }
    });
  }

  // apply a function to each field in the schema
  forEachField(fn) {
    function hasFields(type) {
      // XXX It's not the method we deserve, but the method we need here...
      return typeof type.getFields === 'function';
    }

    this.forEachType((type) => {
      if (hasFields(type)) {
        const fieldMap = type.getFields();
        Object.keys(fieldMap).forEach(fieldName => fn(fieldMap[fieldName]));
      }
    });
  }

  // apply a function to each type in the schema
  forEachType(fn) {
    function isBuiltinTypeName(typeName) {
      const builtins = ['Int', 'String', 'Boolean', 'Float', 'ID'];
      return typeName.startsWith('__') || builtins.indexOf(typeName) >= 0;
    }

    const typeMap = this.schema.getTypeMap();
    Object.keys(typeMap).forEach(typeName => {
      if (!isBuiltinTypeName(typeName)) {
        fn(typeMap[typeName]);
      }
    });
  }
}

function applyDecorators(decoratedThing) {
  return decoratedThing;
}

// this will look for any decorators defined in the schema and apply them,
// starting with the innermost decorator
function applySchemaDecorators(schema) {
  // XXX we could also traverse the schema once first, and remember the
  // locations of decorators, so we can apply them right away, but that's
  // an optimization we can do later.
  const schemaIterator = new SchemaIterator(schema);

  schemaIterator.forEachArg();
  schemaIterator.forEachField();
  schemaIterator.forEachType();

  applyDecorators(schema);

  // modifies the schema in-place, doesn't return anything.
}


export { SchemaIterator, applySchemaDecorators };
