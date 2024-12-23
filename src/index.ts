import { Plugin } from 'unified'
import { unified } from 'unified'
import type { Root } from 'mdast'
import { VFile } from 'vfile'
import remarkMdx from 'remark-mdx'
import remarkGfm from 'remark-gfm'
import remarkFrontmatter from 'remark-frontmatter'
import remarkParse from 'remark-parse'
import remarkStringify, { type Options as StringifyOptions } from 'remark-stringify'
import { parseYamlLd, type YamlLdData } from './yaml-ld'

interface RemarkMdxldOptions {
  preferDollarPrefix?: boolean
  gfm?: boolean
}

function disableGfm() {
  return (tree: Root) => {
    // Convert GFM syntax to plain text before parsing
    const visit = (node: any): any => {
      if (node.type === 'text' && typeof node.value === 'string') {
        // Convert table syntax to plain text
        node.value = node.value.replace(/\|.*\|/g, (match: string) => {
          return match.replace(/\|/g, ' ');
        });
        // Convert task list syntax to plain text
        node.value = node.value.replace(/^\s*[-*+]\s*\[[x ]\]/gmi, '-');
      }
      if (Array.isArray(node.children)) {
        node.children = node.children.map(visit);
      }
      return node;
    };
    return visit(tree);
  };
}

export function createProcessor(options: RemarkMdxldOptions = {}) {
  const { gfm = true } = options
  const stringifyOptions: StringifyOptions = {
    listItemIndent: 'one',
    bullet: '-',
    ...(gfm ? {
      rule: '-',
      fence: '`',
      fences: true,
      incrementListMarker: true,
    } : {
      emphasis: '_',
      strong: '*',
      fence: '`',
      fences: true,
      table: false,
      tablePipeAlign: false,
      tableCellPadding: false
    })
  }

  const processor = unified()
    .use(remarkParse)
    .use(remarkMdx)
    .use(remarkFrontmatter, ['yaml'])
  
  if (gfm) {
    processor.use(remarkGfm)
  } else {
    processor.use(disableGfm)
  }

  return processor.use(remarkStringify, stringifyOptions)
}

const remarkMdxld: Plugin<[RemarkMdxldOptions?], Root> = (options = {}) => {
  const { preferDollarPrefix = true } = options

  return function transformer(tree: Root, file: VFile) {
    // Find and process YAML frontmatter
    const yamlNode = tree.children.find((node): node is Root['children'][number] & { type: 'yaml'; value: string } => node.type === 'yaml')

    if (!yamlNode) {
      const error = new Error('Missing required frontmatter')
      file.message(error.message)
      throw error
    }

    try {
      const processedData = parseYamlLd(yamlNode.value, preferDollarPrefix)
      file.data.yamlLd = processedData
    } catch (error) {
      if (error instanceof Error) {
        file.message(error.message)
      }
      throw error
    }

    return tree
  }
}

export default remarkMdxld
export type { RemarkMdxldOptions, YamlLdData }
