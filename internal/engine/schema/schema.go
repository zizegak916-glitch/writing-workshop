// Package schema contains the small JSON Schema builder used by Writing
// Workshop tools. Keeping it local makes tool contracts reviewable without a
// provider SDK or an agent framework dependency.
package schema

type Prop struct {
	name     string
	schema   map[string]any
	required bool
}

func (p Prop) Required() Prop {
	p.required = true
	return p
}

func Object(props ...Prop) map[string]any {
	properties := make(map[string]any, len(props))
	required := make([]string, 0, len(props))
	for _, prop := range props {
		properties[prop.name] = prop.schema
		if prop.required {
			required = append(required, prop.name)
		}
	}
	result := map[string]any{
		"type":                 "object",
		"properties":           properties,
		"additionalProperties": false,
	}
	if len(required) > 0 {
		result["required"] = required
	}
	return result
}

func Property(name string, value map[string]any) Prop {
	return Prop{name: name, schema: value}
}

func String(description string) map[string]any { return scalar("string", description) }
func Int(description string) map[string]any    { return scalar("integer", description) }
func Bool(description string) map[string]any   { return scalar("boolean", description) }

func Enum(description string, values ...string) map[string]any {
	result := scalar("string", description)
	result["enum"] = values
	return result
}

func Array(description string, item map[string]any) map[string]any {
	result := scalar("array", description)
	result["items"] = item
	return result
}

func scalar(kind, description string) map[string]any {
	result := map[string]any{"type": kind}
	if description != "" {
		result["description"] = description
	}
	return result
}
