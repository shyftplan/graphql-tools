import { SchemaIterator, applyDecorators } from '../src/decorate';
import { makeExecutableSchema } from '../src/schemaGenerator';
import { expect } from 'chai';
import {
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLString,
  graphql,
} from 'graphql';

const testSchema = `
      type OtherType {
        aString(arg1: Int): String
      }
      type RootQuery {
        otherType(arg0: Boolean): OtherType
      }
      schema {
        query: RootQuery
      }
    `;
const testResolvers = {
  RootQuery: {
    otherType: () => {
      return {};
    },
  },
  OtherType: {
    aString: () => {
      return 'x';
    },
  },
};
class TestConnector {
  get() {
    return 'works';
  }
}
const testConnectors = {
  TestConnector,
};

const jsSchema = makeExecutableSchema({
  typeDefs: testSchema,
  resolvers: testResolvers,
  connectors: testConnectors,
});


describe('SchemaIterator', () => {
  it('can iterate over types', () => {
    const typeNameAry = [];
    const fn = (type) => {
      typeNameAry.push(type.name);
    };

    const it = new SchemaIterator(jsSchema);
    it.forEachType(fn);
    expect(typeNameAry).to.contain('RootQuery');
    expect(typeNameAry).to.contain('OtherType');
  });
  it('can iterate over fields', () => {
    const fieldNameAry = [];
    const fn = (field) => {
      fieldNameAry.push(field.name);
    };

    const it = new SchemaIterator(jsSchema);
    it.forEachField(fn);
    expect(fieldNameAry).to.contain('aString');
    expect(fieldNameAry).to.contain('otherType');
  });
  it('can iterate over args', () => {
    const argNameAry = [];
    const fn = (arg) => {
      argNameAry.push(arg.name);
    };

    const it = new SchemaIterator(jsSchema);
    it.forEachArg(fn);
    expect(argNameAry).to.contain('arg0');
    expect(argNameAry).to.contain('arg1');
  });
});

function descriptionDecorator({ desc }) {
  return function description(field) {
    // eslint-disable-next-line no-param-reassign
    field.description = desc;
  };
}

function authDecorator({ role }) {
  return function auth(type) {
    const rf = type.resolve;
    // eslint-disable-next-line no-param-reassign
    type.resolve = (root, args, ctx, info) => {
      if (ctx.role !== role) {
        return 'nope';
      }
      return rf(root, args, ctx, info);
    };
  };
}

describe('Decorating GraphQL-JS schemas', () => {
  it('can decorate fields', () => {
    const TestType = new GraphQLObjectType({
      name: 'TestType',
      fields: () => ({
        testString: {
          type: GraphQLString,
          decorators: [descriptionDecorator({ desc: 'test123' })],
        },
      }),
    });

    const schemaWithDecorators = new GraphQLSchema({
      query: new GraphQLObjectType({
        name: 'Query',
        fields: () => ({
          test: {
            type: TestType,
            decorators: [authDecorator({ role: 'admin' })],
            resolve(root) {
              return root;
            },
          },
        }),
      }),
    });

    applyDecorators(schemaWithDecorators);
    const query = `{
      __type(name: "TestType"){
        fields{
          description
        }
      }
    }`;
    const expected = {
      data: {
        __type: {
          fields: [{
            description: 'test123',
          }],
        },
      },
    };
    return graphql(schemaWithDecorators, query).then((res) => {
      return expect(res).to.deep.equal(expected);
    });
  });

  it('can decorate types', () => {
    const schemaWithDecorators = new GraphQLSchema({
      query: new GraphQLObjectType({
        name: 'Query',
        fields: () => ({
          test: {
            type: GraphQLString,
            decorators: [authDecorator({ role: 'admin' })],
            resolve(root) {
              return root;
            },
          },
        }),
      }),
    });
    applyDecorators(schemaWithDecorators);
    const query = `{
      test
    }`;
    const expectedWithoutRole = {
      data: {
        test: 'nope',
      },
    };
    const expectedWithRole = {
      data: {
        test: 'rut',
      },
    };
    const withoutRole = graphql(schemaWithDecorators, query, 'rut', {}).then((res) => {
      return expect(res).to.deep.equal(expectedWithoutRole);
    });

    const withRole = graphql(schemaWithDecorators, query, 'rut', { role: 'admin' }).then((res) => {
      return expect(res).to.deep.equal(expectedWithRole);
    });

    return Promise.all([withoutRole, withRole]);
  });
});
