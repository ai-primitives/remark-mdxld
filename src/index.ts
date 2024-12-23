import { Plugin } from 'unified'
import { unified } from 'unified'
import type { Root, Node, Text } from 'mdast'
import { VFile } from 'vfile'
import remarkMdx from 'remark-mdx'
import remarkGfm from 'remark-gfm'
import remarkFrontmatter from 'remark-frontmatter'
import remarkParse from 'remark-parse'
import remarkStringify, { type Options as StringifyOptions } from 'remark-stringify'
import { parseYamlLd, type YamlLdData } from './yaml-ld.js'

interface RemarkMdxldOptions {
  preferDollarPrefix?: boolean
  gfm?: boolean
}

function disableGfm(): Plugin<[], Root> {
  return () => {
    return function transformer(tree: Root) {
      function visit(node: Node): void {
        if (node.type === 'text') {
          const textNode = node as Text;
          // Convert table syntax to plain text
          textNode.value = textNode.value.replace(/\|.*\|/g, (match: string) => {
            return match.replace(/\|/g, ' ');
          });
          // Convert task list syntax to plain text
          textNode.value = textNode.value.replace(/^\s*[-*+]\s*\[[x ]\]/gmi, '-');
        }
        if ('children' in node && Array.isArray(node.children)) {
          node.children.forEach(child => visit(child));
        }
      }
      visit(tree);
      return tree;
    }
  }
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
    processor.use(disableGfm())
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
