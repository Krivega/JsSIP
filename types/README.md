# Stable public declarations for 8.x

The TypeScript migration tightened generated declarations and exposed private
implementation details. Shipping those declarations in 8.0.3 broke existing
consumers, including sip-connector, even though source tests passed.

These declarations preserve the published 8.x contract for URI, NameAddrHeader,
WebSocketInterface, and SIP messages. They are copied over the generated files
after compilation. Runtime code and internal TypeScript checks continue to use
the strict source types.

In particular, the legacy non-null return types remain unchanged even where
the runtime can return undefined. Changing those signatures requires a major
release. Internal header stores and private fields are not part of the stable
public contract. Socket implementations remain structurally assignable.

Run `npm run test:types` to build the package and compile the consumer fixture
against its shipped declarations, without skipLibCheck. Keep new public APIs
in these declarations as well as in the source until the next major release.
