
// Decorators let you transform a GraphQL schema in lots and lots of cool ways!

class SchemaIterator {
  constructor(schema) {
    this.schema = schema;
  }

  // apply a function to each arg
  forEachArg(fn) {
    return;
  }

  // apply a function to each field in the schema
  forEachField(fn) {
    return;
  }

  // apply a function to each type in the schema
  forEachType(fn) {
    return;
  }
}

function applyDecorators(decoratedThing) {
  return decoratedThing;
}

// this will look for any decorators defined in the schema and apply them,
// starting with the innermost decorator
function applySchemaDecorators(schema){

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


export { SchemaIterator, applySchemaDecorators }
