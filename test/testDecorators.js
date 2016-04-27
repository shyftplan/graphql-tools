import { SchemaIterator } from '../src/decorate';
import { makeExecutableSchema } from '../src/schemaGenerator';
import { expect } from 'chai';

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
