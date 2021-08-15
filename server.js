const express = require("express");
const { graphqlHTTP } = require("express-graphql");
const { makeExecutableSchema } = require("@graphql-tools/schema");
const { applyMiddleware } = require("graphql-middleware");
const { shield, rule, and, inputRule } = require("graphql-shield");

const typeDefs = `
  type Query {
    me: User
    users: [User!]!
  }

  type Mutation {
    createUser(input: CreateUserInput): User
  }

  type User {
    id: ID!
    name: String!
    email: String!
    role: Role
  }

  input CreateUserInput {
    name: String!
    email: String!
  }

  enum Role {
    USER
    ADMIN
  }
`;

const users = [
  {
    id: "1",
    name: "Jamie",
    role: "USER",
    email: "jamie@graphql.wtf",
  },
  {
    id: "2",
    name: "Michael",
    role: "ADMIN",
    email: "michael@example.org",
  },
  {
    id: "3",
    name: "Daniel",
    role: "USER",
    email: "daniel@example.org",
  },
];

const resolvers = {
  Query: {
    users: () => users,
    me: (_, __, ctx) => users.find(({ id }) => id === ctx.headers["user-id"]),
  },
  Mutation: {
    createUser: (_, { input }) => ({
      id: "4",
      role: "USER",
      ...input,
    }),
  },
};

const schema = makeExecutableSchema({ typeDefs, resolvers });

// Pass `User-Id` as a header to the GraphQL server on request
const isAuthenticated = rule()(async (parent, args, ctx, info) => {
  return !!ctx.headers["user-id"];
});

const isAdmin = rule()(async (parent, args, ctx, info) => {
  const user = users.find(({ id }) => id === ctx.headers["user-id"]);

  return user && user.role === "ADMIN";
});

const isNotAlreadyRegistered = inputRule()((yup) =>
  yup.object({
    input: yup.object({
      name: yup.string().required(),
      email: yup
        .string()
        .email()
        .required()
        .notOneOf(
          users.map(({ email }) => email),
          "A user exists with this email. Choose another."
        ),
    }),
  })
);

const permissions = shield({
  Query: {
    // "*": deny,
    // "*": allow,
    users: and(isAuthenticated, isAdmin),
    me: isAuthenticated,
  },
  Mutation: {
    // "*": deny,
    createUser: isNotAlreadyRegistered,
  },
});

const schemaWithPermissions = applyMiddleware(schema, permissions);

const app = express();

app.use(
  "/graphql",
  graphqlHTTP({
    schema: schemaWithPermissions,
    graphiql: {
      headerEditorEnabled: true,
    },
  })
);

app.listen(4000, () => {
  console.log(`Server listening on http://localhost:4000`);
});
