import lapSchema from '../schemas/lap.schema.json' with { type: 'json' };
import lppSchema from '../schemas/lpp.schema.json' with { type: 'json' };
import pluginManifestSchema from '../schemas/plugin-manifest.schema.json' with { type: 'json' };

function valueType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function matchesType(value, expected) {
  const actual = valueType(value);
  if (expected === 'integer') return actual === 'number' && Number.isInteger(value);
  if (expected === 'number') return actual === 'number' && Number.isFinite(value);
  return actual === expected;
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, index) => deepEqual(item, b[index]));
  }
  if (valueType(a) === 'object' && valueType(b) === 'object') {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((key) => Object.hasOwn(b, key) && deepEqual(a[key], b[key]));
  }
  return false;
}

function resolveRef(root, ref) {
  if (!ref.startsWith('#/')) {
    throw new Error(`Unsupported $ref: ${ref}`);
  }
  return ref
    .slice(2)
    .split('/')
    .map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'))
    .reduce((node, part) => {
      if (node === undefined || node === null) return undefined;
      return node[part];
    }, root);
}

function joinPath(path, key) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;
}

export function validate(schema, value, root = schema, path = '$') {
  const errors = [];

  if (schema === undefined || schema === null) return errors;

  if (schema.$ref) {
    const resolved = resolveRef(root, schema.$ref);
    if (!resolved) {
      errors.push(`${path}: unresolved $ref ${schema.$ref}`);
      return errors;
    }
    return validate(resolved, value, root, path);
  }

  if (schema.const !== undefined && !deepEqual(value, schema.const)) {
    errors.push(`${path}: expected constant ${JSON.stringify(schema.const)}`);
  }

  if (schema.enum && !schema.enum.some((item) => deepEqual(item, value))) {
    errors.push(`${path}: expected one of ${schema.enum.map((item) => JSON.stringify(item)).join(', ')}`);
  }

  if (schema.type) {
    const expected = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!expected.some((type) => matchesType(value, type))) {
      errors.push(`${path}: expected ${expected.join(' or ')}, got ${valueType(value)}`);
      return errors;
    }
  }

  if (valueType(value) === 'object') {
    if (Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (!Object.hasOwn(value, key)) errors.push(`${joinPath(path, key)}: required property missing`);
      }
    }
    if (schema.properties) {
      for (const [key, subSchema] of Object.entries(schema.properties)) {
        if (Object.hasOwn(value, key)) {
          errors.push(...validate(subSchema, value[key], root, joinPath(path, key)));
        }
      }
    }
    if (schema.additionalProperties === false && schema.properties) {
      for (const key of Object.keys(value)) {
        if (!Object.hasOwn(schema.properties, key)) {
          errors.push(`${joinPath(path, key)}: unexpected property`);
        }
      }
    } else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      const declared = schema.properties ?? {};
      for (const [key, item] of Object.entries(value)) {
        if (!Object.hasOwn(declared, key)) {
          errors.push(...validate(schema.additionalProperties, item, root, joinPath(path, key)));
        }
      }
    }
  }

  if (Array.isArray(value)) {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) {
      errors.push(`${path}: expected at least ${schema.minItems} item(s), got ${value.length}`);
    }
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) {
      errors.push(`${path}: expected at most ${schema.maxItems} item(s), got ${value.length}`);
    }
    if (schema.uniqueItems) {
      for (let i = 0; i < value.length; i += 1) {
        for (let j = i + 1; j < value.length; j += 1) {
          if (deepEqual(value[i], value[j])) errors.push(`${path}: duplicate item at indexes ${i} and ${j}`);
        }
      }
    }
    if (schema.items) {
      value.forEach((item, index) => {
        errors.push(...validate(schema.items, item, root, `${path}[${index}]`));
      });
    }
  }

  if (typeof value === 'string') {
    if (typeof schema.minLength === 'number' && value.length < schema.minLength) {
      errors.push(`${path}: expected at least ${schema.minLength} character(s)`);
    }
    if (typeof schema.maxLength === 'number' && value.length > schema.maxLength) {
      errors.push(`${path}: expected at most ${schema.maxLength} character(s)`);
    }
    if (schema.pattern && !new RegExp(schema.pattern, 'u').test(value)) {
      errors.push(`${path}: does not match pattern ${schema.pattern}`);
    }
  }

  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum) {
      errors.push(`${path}: expected >= ${schema.minimum}, got ${value}`);
    }
    if (typeof schema.maximum === 'number' && value > schema.maximum) {
      errors.push(`${path}: expected <= ${schema.maximum}, got ${value}`);
    }
  }

  if (Array.isArray(schema.allOf)) {
    for (const subSchema of schema.allOf) {
      errors.push(...validate(subSchema, value, root, path));
    }
  }

  if (Array.isArray(schema.anyOf)) {
    const matches = schema.anyOf.some((subSchema) => validate(subSchema, value, root, path).length === 0);
    if (!matches) errors.push(`${path}: does not match any allowed schema`);
  }

  if (Array.isArray(schema.oneOf)) {
    const matches = schema.oneOf.filter((subSchema) => validate(subSchema, value, root, path).length === 0);
    if (matches.length !== 1) errors.push(`${path}: expected exactly one matching schema, got ${matches.length}`);
  }

  return errors;
}

export function assertValid(errors, label = 'Invalid document') {
  if (errors.length > 0) {
    throw new Error(`${label}:\n${errors.join('\n')}`);
  }
}

export function validateLap(value) {
  return validate(lapSchema, value);
}

export function validateLpp(value) {
  return validate(lppSchema, value);
}

export function validatePluginManifest(value) {
  return validate(pluginManifestSchema, value);
}

export { lapSchema, lppSchema, pluginManifestSchema };
