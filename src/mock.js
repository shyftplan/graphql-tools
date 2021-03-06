import {
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLEnumType,
  GraphQLUnionType,
  GraphQLInterfaceType,
  GraphQLList,
  getNullableType,
  getNamedType,
} from 'graphql/type';
import { graphql } from 'graphql';
import uuid from 'node-uuid';
import { forEachField, buildSchemaFromTypeDefinitions } from './schemaGenerator';

// This function wraps addMockFunctionsToSchema for more convenience
function mockServer(schema, mocks = {}, preserveResolvers = false) {
  let mySchema = schema;
  if (!(schema instanceof GraphQLSchema)) {
    // TODO: provide useful error messages here if this fails
    mySchema = buildSchemaFromTypeDefinitions(schema);
  }
  addMockFunctionsToSchema({ schema: mySchema, mocks, preserveResolvers });

  return { query: (query, vars) => graphql(mySchema, query, {}, {}, vars) };
}

// TODO allow providing a seed such that lengths of list could be deterministic
// this could be done by using casual to get a random list length if the casual
// object is global.
function addMockFunctionsToSchema({ schema, mocks = {}, preserveResolvers = false } = {}) {
  function isObject(thing) {
    return thing === Object(thing) && !Array.isArray(thing);
  }
  if (!schema) {
    // XXX should we check that schema is an instance of GraphQLSchema?
    throw new Error('Must provide schema to mock');
  }
  if (!isObject(mocks)) {
    throw new Error('mocks must be of type Object');
  }

  // use Map internally, because that API is nicer.
  const mockFunctionMap = new Map();
  Object.keys(mocks).forEach((typeName) => {
    mockFunctionMap.set(typeName, mocks[typeName]);
  });

  mockFunctionMap.forEach((mockFunction, mockTypeName) => {
    if (typeof mockFunction !== 'function') {
      throw new Error(`mockFunctionMap[${mockTypeName}] must be a function`);
    }
  });

  const defaultMockMap = new Map();
  defaultMockMap.set('Int', () => Math.round(Math.random() * 200) - 100);
  defaultMockMap.set('Float', () => (Math.random() * 200) - 100);
  defaultMockMap.set('String', () => 'Hello World');
  defaultMockMap.set('Boolean', () => Math.random() > 0.5);
  defaultMockMap.set('ID', () => uuid.v4());

  function mergeObjects(a, b) {
    return Object.assign(a, b);
  }

  // returns a random element from that ary
  function getRandomElement(ary) {
    const sample = Math.floor(Math.random() * ary.length);
    return ary[sample];
  }

  // takes either an object or a (possibly nested) array
  // and completes the customMock object with any fields
  // defined on genericMock
  // only merges objects or arrays. Scalars are returned as is
  function mergeMocks(genericMockFunction, customMock) {
    if (Array.isArray(customMock)) {
      return customMock.map((el) => mergeMocks(genericMockFunction, el));
    }
    if (isObject(customMock)) {
      return mergeObjects(genericMockFunction(), customMock);
    }
    return customMock;
  }

  function assignResolveType(type) {
    const fieldType = getNullableType(type);
    const namedFieldType = getNamedType(fieldType);

    const oldResolveType = namedFieldType.resolveType;
    if (preserveResolvers && oldResolveType && oldResolveType.length) {
      return;
    }

    if (namedFieldType instanceof GraphQLUnionType ||
        namedFieldType instanceof GraphQLInterfaceType
    ) {
      // the default `resolveType` always returns null. We add a fallback
      // resolution that works with how unions and interface are mocked
      namedFieldType.resolveType = (data, context, info) =>
        info.schema.getType(data.typename);
    }
  }

  const mockType = function mockType(type, typeName, fieldName) {
    // order of precendence for mocking:
    // 1. if the object passed in already has fieldName, just use that
    // --> if it's a function, that becomes your resolver
    // --> if it's a value, the mock resolver will return that
    // 2. if the nullableType is a list, recurse
    // 2. if there's a mock defined for this typeName, that will be used
    // 3. if there's no mock defined, use the default mocks for this type
    return (...args) => {
      const [root, queryArgs, context, info] = args;

      // nullability doesn't matter for the purpose of mocking.
      const fieldType = getNullableType(type);
      const namedFieldType = getNamedType(fieldType);

      if (root && typeof root[fieldName] !== 'undefined') {
        let result;
        // if we're here, the field is already defined
        if (typeof root[fieldName] === 'function') {
          result = root[fieldName](...args);
          if (result instanceof MockList) {
            result = result.mock(...args, fieldType, mockType);
          }
        } else {
          result = root[fieldName];
        }

        // Now we merge the result with the default mock for this type.
        // This allows overriding defaults while writing very little code.
        if (mockFunctionMap.has(namedFieldType.name)) {
          result = mergeMocks(
            mockFunctionMap.get(namedFieldType.name).bind(null, ...args), result
          );
        }
        return result;
      }

      if (fieldType instanceof GraphQLList) {
        return [mockType(fieldType.ofType)(...args), mockType(fieldType.ofType)(...args)];
      }
      if (mockFunctionMap.has(fieldType.name)) {
        // the object passed doesn't have this field, so we apply the default mock
        return mockFunctionMap.get(fieldType.name)(...args);
      }
      if (fieldType instanceof GraphQLObjectType) {
        // objects don't return actual data, we only need to mock scalars!
        return {};
      }
      // TODO mocking Interface and Union types will require determining the
      // resolve type before passing it on.
      // XXX we recommend a generic way for resolve type here, which is defining
      // typename on the object.
      if (fieldType instanceof GraphQLUnionType) {
        const randomType = getRandomElement(fieldType.getTypes());
        return {
          typename: randomType,
          ...mockType(randomType)(...args),
        };
      }
      if (fieldType instanceof GraphQLInterfaceType) {
        const possibleTypes = schema.getPossibleTypes(fieldType);
        const randomType = getRandomElement(possibleTypes);
        return {
          typename: randomType,
          ...mockType(randomType)(...args),
        };
      }
      if (fieldType instanceof GraphQLEnumType) {
        return getRandomElement(fieldType.getValues()).value;
      }
      if (defaultMockMap.has(fieldType.name)) {
        return defaultMockMap.get(fieldType.name)(...args);
      }
      // if we get to here, we don't have a value, and we don't have a mock for this type,
      // we could return undefined, but that would be hard to debug, so we throw instead.
      throw new Error(`No mock defined for type "${fieldType.name}"`);
    };
  };

  forEachField(schema, (field, typeName, fieldName) => {
    assignResolveType(field.type);

    // we have to handle the root mutation and root query types differently,
    // because no resolver is called at the root.
    const isOnQueryType = typeName === (schema.getQueryType() || {}).name;
    const isOnMutationType = typeName === (schema.getMutationType() || {}).name;
    if (isOnQueryType || isOnMutationType) {
      if (mockFunctionMap.has(typeName)) {
        const rootMock = mockFunctionMap.get(typeName);
        if (rootMock()[fieldName]) {
          // TODO: assert that it's a function
          // eslint-disable-next-line no-param-reassign
          field.resolve = (root, ...rest) => {
            const updatedRoot = root || {}; // TODO: should we clone instead?
            updatedRoot[fieldName] = rootMock()[fieldName];
            // XXX this is a bit of a hack to still use mockType, which
            // lets you mock lists etc. as well
            // otherwise we could just set field.resolve to rootMock()[fieldName]
            // it's like pretending there was a resolve function that ran before
            // the root resolve function.
            return mockType(
              field.type, typeName, fieldName)(updatedRoot, ...rest);
          };
          return;
        }
      }
    }
    if (!preserveResolvers || !field.resolve) {
      // eslint-disable-next-line no-param-reassign
      field.resolve = mockType(field.type, typeName, fieldName);
    } else {
      const oldResolver = field.resolve;
      const mockResolver = mockType(field.type, typeName, fieldName);
      // eslint-disable-next-line no-param-reassign
      field.resolve = (...args) => {
        const mockedValue = mockResolver(...args);
        const resolvedValue = oldResolver(...args);
        return typeof mockedValue === 'object' && typeof resolvedValue === 'object'
          ? Object.assign({}, mockedValue, resolvedValue) : resolvedValue;
      };
    }
  });
}

class MockList {
  // wrappedFunction can return another MockList or a value
  constructor(len, wrappedFunction) {
    this.len = len;
    if (typeof wrappedFunction !== 'undefined') {
      if (typeof wrappedFunction !== 'function') {
        throw new Error('Second argument to MockList must be a function or undefined');
      }
      this.wrappedFunction = wrappedFunction;
    }
  }

  mock(root, args, context, info, fieldType, mockTypeFunc) {
    function randint(low, high) {
      return Math.floor((Math.random() * ((high - low) + 1)) + low);
    }
    let arr;
    if (Array.isArray(this.len)) {
      arr = new Array(randint(this.len[0], this.len[1]));
    } else {
      arr = new Array(this.len);
    }
    for (let i = 0; i < arr.length; i++) {
      if (typeof this.wrappedFunction === 'function') {
        const res = this.wrappedFunction(root, args, context, info);
        if (res instanceof MockList) {
          const nullableType = getNullableType(fieldType.ofType);
          arr[i] = res.mock(root, args, context, info, nullableType, mockTypeFunc);
        } else {
          arr[i] = res;
        }
      } else {
        arr[i] = mockTypeFunc(fieldType.ofType)(root, args, context, info);
      }
    }
    return arr;
  }
}

export {
  addMockFunctionsToSchema,
  MockList,
  mockServer,
};
