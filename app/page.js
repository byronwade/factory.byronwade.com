'use client'

import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Download, Upload, FileSpreadsheet, FileText, Plus, Sun, Moon, Laptop } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import ProgressDisplay from './progress-display'

export default function Home() {
  const [file, setFile] = useState(null)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState(null)
  const [generationProgress, setGenerationProgress] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [csvContent, setCsvContent] = useState('')
  const [singlePost, setSinglePost] = useState({ title: '', link: '', image: null })
  const [theme, setTheme] = useState('system')

  const onDrop = useCallback((acceptedFiles) => {
    setFile(acceptedFiles[0])
    setError(null)
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop, 
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv'],
      'application/json': ['.json']
    }
  })

  const handleUpload = async () => {
    if (!file && !csvContent && !singlePost.title) {
      setError('Please provide input data before processing')
      return
    }

    setIsUploading(true)
    setError(null)
    setGenerationProgress([])

    // Simulating API call and progress updates
    for (let i = 0; i < 5; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000))
      setGenerationProgress(prev => [...prev, {
        message: `Processing step ${i + 1}`,
        status: 'pending',
        details: { wordCount: Math.floor(Math.random() * 100), cost: Math.random() * 0.1 }
      }])
    }

    setGenerationProgress(prev => [...prev, { message: 'Processing complete!', status: 'complete' }])
    setIsUploading(false)
  }

  const handleDownload = async () => {
    setIsLoading(true)
    await new Promise(resolve => setTimeout(resolve, 2000))
    setIsLoading(false)
  }

  const handleThemeChange = (newTheme) => {
    setTheme(newTheme)
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="p-4 shadow-md bg-primary text-primary-foreground">
        <div className="container flex items-center justify-between mx-auto">
          <h1 className="text-2xl font-bold">Content Factory</h1>
          <div className="flex items-center space-x-4">
            <Button variant="secondary" size="sm" onClick={handleDownload} disabled={isLoading}>
              <Download className="w-4 h-4 mr-2" />
              {isLoading ? 'Generating...' : 'Download Example'}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="icon" className="h-9 w-9">
                  {theme === 'light' && <Sun className="h-[1.2rem] w-[1.2rem]" />}
                  {theme === 'dark' && <Moon className="h-[1.2rem] w-[1.2rem]" />}
                  {theme === 'system' && <Laptop className="h-[1.2rem] w-[1.2rem]" />}
                  <span className="sr-only">Toggle theme</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleThemeChange('light')}>
                  <Sun className="w-4 h-4 mr-2" />
                  <span>Light</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleThemeChange('dark')}>
                  <Moon className="w-4 h-4 mr-2" />
                  <span>Dark</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleThemeChange('system')}>
                  <Laptop className="w-4 h-4 mr-2" />
                  <span>System</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="container max-w-3xl p-4 mx-auto mt-8">
        <Card className="w-full">
          <CardContent className="p-6">
            <Tabs defaultValue="excel" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="excel">
                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                  Excel/CSV
                </TabsTrigger>
                <TabsTrigger value="json">
                  <FileText className="w-4 h-4 mr-2" />
                  JSON
                </TabsTrigger>
                <TabsTrigger value="text">
                  <FileText className="w-4 h-4 mr-2" />
                  Text Input
                </TabsTrigger>
                <TabsTrigger value="single">
                  <Plus className="w-4 h-4 mr-2" />
                  Single Post
                </TabsTrigger>
              </TabsList>
              <TabsContent value="excel">
                <div
                  {...getRootProps()}
                  className="p-6 text-center transition-colors border-2 border-gray-300 border-dashed rounded-lg cursor-pointer hover:border-primary"
                >
                  <input {...getInputProps()} />
                  {isDragActive ? (
                    <p>Drop the Excel or CSV file here ...</p>
                  ) : (
                    <p>Drag &apos;n&apos; drop an Excel or CSV file here, or click to select one</p>
                  )}
                </div>
                {file && (
                  <p className="mt-2 text-sm text-gray-500">
                    Selected file: {file.name}
                  </p>
                )}
              </TabsContent>
              <TabsContent value="json">
                <div
                  {...getRootProps()}
                  className="p-6 text-center transition-colors border-2 border-gray-300 border-dashed rounded-lg cursor-pointer hover:border-primary"
                >
                  <input {...getInputProps()} />
                  {isDragActive ? (
                    <p>Drop the JSON file here ...</p>
                  ) : (
                    <p>Drag &apos;n&apos; drop a JSON file here, or click to select one</p>
                  )}
                </div>
                {file && (
                  <p className="mt-2 text-sm text-gray-500">
                    Selected file: {file.name}
                  </p>
                )}
              </TabsContent>
              <TabsContent value="text">
                <Textarea
                  placeholder="Paste your content here (CSV format or one title per line)..."
                  value={csvContent}
                  onChange={(e) => setCsvContent(e.target.value)}
                  className="min-h-[200px]"
                />
              </TabsContent>
              <TabsContent value="single">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="post-title">Post Title</Label>
                    <Input
                      id="post-title"
                      value={singlePost.title}
                      onChange={(e) => setSinglePost(prev => ({ ...prev, title: e.target.value }))}
                      placeholder="Enter post title"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="post-link" className="flex items-center">
                      Post Link
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="ml-1 text-gray-500">(optional)</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Adding a link is recommended for better content generation</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </Label>
                    <Input
                      id="post-link"
                      value={singlePost.link}
                      onChange={(e) => setSinglePost(prev => ({ ...prev, link: e.target.value }))}
                      placeholder="Enter post link (optional)"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="post-image">Post Image</Label>
                    <Input
                      id="post-image"
                      type="file"
                      accept="image/*"
                      onChange={(e) => setSinglePost(prev => ({ ...prev, image: e.target.files[0] }))}
                    />
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            <Button
              onClick={handleUpload}
              disabled={isUploading}
              className="w-full mt-4"
            >
              {isUploading ? 'Processing...' : 'Process Content'}
              <Upload className="w-4 h-4 ml-2" />
            </Button>

            <ProgressDisplay isProcessing={isUploading} progressSteps={generationProgress} />

            {error && (
              <p className="mt-2 text-sm text-red-500">{error}</p>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}