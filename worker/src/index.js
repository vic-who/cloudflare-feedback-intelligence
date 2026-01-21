/**
 * Cloudflare Feedback Intelligence API
 * Fixed version with proper response formats
 */

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);
		const path = url.pathname;

		const corsHeaders = {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type',
		};

		if (request.method === 'OPTIONS') {
			return new Response(null, { headers: corsHeaders });
		}

		try {
			// Health check
			if (path === '/' && request.method === 'GET') {
				return new Response(JSON.stringify({
					message: 'Feedback Intelligence API',
					version: '1.0.0',
					status: 'healthy'
				}), {
					headers: { ...corsHeaders, 'Content-Type': 'application/json' }
				});
			}

			// Get stats - Returns format expected by dashboard
			if (path === '/api/stats' && request.method === 'GET') {
				try {
					const feedbackCount = await env.DB.prepare(
						'SELECT COUNT(*) as count FROM feedback'
					).first();

					const { results: sentiment } = await env.DB.prepare(`
						SELECT sentiment, COUNT(*) as count 
						FROM feedback 
						GROUP BY sentiment
					`).all();

					const { results: sources } = await env.DB.prepare(`
						SELECT source, COUNT(*) as count 
						FROM feedback 
						GROUP BY source
						ORDER BY count DESC
						LIMIT 5
					`).all();

					const themeCount = await env.DB.prepare(
						'SELECT COUNT(*) as count FROM themes WHERE status = "active"'
					).first();

					return new Response(JSON.stringify({
						totalFeedback: feedbackCount?.count || 0,
						totalThemes: themeCount?.count || 0,
						sentimentDistribution: sentiment || [],
						topSources: sources || []
					}), {
						headers: { ...corsHeaders, 'Content-Type': 'application/json' }
					});
				} catch (error) {
					// Return empty stats if DB not initialized
					return new Response(JSON.stringify({
						totalFeedback: 0,
						totalThemes: 0,
						sentimentDistribution: [],
						topSources: []
					}), {
						headers: { ...corsHeaders, 'Content-Type': 'application/json' }
					});
				}
			}

			// Create feedback
			if (path === '/api/feedback' && request.method === 'POST') {
				const { text, source, category, user_tier, company_size } = await request.json();
				
				if (!text || !source) {
					return new Response(JSON.stringify({ error: 'text and source required' }), {
						status: 400,
						headers: { ...corsHeaders, 'Content-Type': 'application/json' }
					});
				}

				// Analyze sentiment with Workers AI
				let sentiment = 'neutral';
				let sentiment_score = 0.5;
				try {
					if (env.AI) {
						const ai_response = await env.AI.run('@cf/huggingface/distilbert-sst-2-int8', {
							text: text.substring(0, 512)
						});
						const result = ai_response[0];
						sentiment = result.label === 'POSITIVE' ? 'positive' : 
						           result.label === 'NEGATIVE' ? 'negative' : 'neutral';
						sentiment_score = result.score;
					}
				} catch (e) {
					console.log('AI skipped:', e.message);
				}

				const id = crypto.randomUUID();
				
				await env.DB.prepare(`
					INSERT INTO feedback (id, text, source, category, sentiment, sentiment_score, user_tier, company_size)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?)
				`).bind(
					id, 
					text, 
					source, 
					category || 'other',
					sentiment, 
					sentiment_score,
					user_tier || 'free',
					company_size || 'small'
				).run();

				return new Response(JSON.stringify({
					id, text, source, sentiment, sentiment_score,
					message: 'Feedback created successfully'
				}), {
					status: 201,
					headers: { ...corsHeaders, 'Content-Type': 'application/json' }
				});
			}

			// Get feedback - Returns array wrapped in object
			if (path === '/api/feedback' && request.method === 'GET') {
				const source = url.searchParams.get('source');
				const sentiment = url.searchParams.get('sentiment');
				const userTier = url.searchParams.get('user_tier');
				const themeId = url.searchParams.get('theme_id');
				const limit = parseInt(url.searchParams.get('limit') || '100');

				let query = 'SELECT * FROM feedback WHERE 1=1';
				const bindings = [];

				if (source) {
					query += ' AND source = ?';
					bindings.push(source);
				}
				if (sentiment) {
					query += ' AND sentiment = ?';
					bindings.push(sentiment);
				}
				if (userTier) {
					query += ' AND user_tier = ?';
					bindings.push(userTier);
				}
				if (themeId) {
					query += ' AND id IN (SELECT feedback_id FROM feedback_themes WHERE theme_id = ?)';
					bindings.push(themeId);
				}

				query += ' ORDER BY created_at DESC LIMIT ?';
				bindings.push(limit);

				const { results } = await env.DB.prepare(query).bind(...bindings).all();

				return new Response(JSON.stringify(results || []), {
					headers: { ...corsHeaders, 'Content-Type': 'application/json' }
				});
			}

			// Create theme
			if (path === '/api/themes' && request.method === 'POST') {
				const { name, description, priority_band } = await request.json();
				
				if (!name) {
					return new Response(JSON.stringify({ error: 'name required' }), {
						status: 400,
						headers: { ...corsHeaders, 'Content-Type': 'application/json' }
					});
				}

				const id = crypto.randomUUID();
				const priority_score = priority_band === 'critical' ? 25 : 
				                      priority_band === 'high' ? 15 : 
				                      priority_band === 'medium' ? 8 : 3;

				await env.DB.prepare(`
					INSERT INTO themes (id, name, description, priority_band, priority_score, status)
					VALUES (?, ?, ?, ?, ?, 'active')
				`).bind(id, name, description || '', priority_band || 'medium', priority_score).run();

				return new Response(JSON.stringify({
					id, name, description, priority_band, priority_score,
					message: 'Theme created successfully'
				}), {
					status: 201,
					headers: { ...corsHeaders, 'Content-Type': 'application/json' }
				});
			}

			// Get themes - Returns ARRAY directly for dashboard compatibility
			if (path === '/api/themes' && request.method === 'GET') {
				const limit = parseInt(url.searchParams.get('limit') || '50');

				try {
					const { results } = await env.DB.prepare(`
						SELECT 
							t.id,
							t.name,
							t.description,
							t.priority_band,
							t.priority_score,
							t.status,
							t.volume,
							t.positive_count,
							t.neutral_count,
							t.negative_count,
							t.created_at,
							t.updated_at,
							COUNT(ft.feedback_id) as feedback_count,
							COALESCE(
								AVG(CASE 
									WHEN f.sentiment = 'negative' THEN -1
									WHEN f.sentiment = 'positive' THEN 1
									ELSE 0
								END),
								0
							) as avg_sentiment
						FROM themes t
						LEFT JOIN feedback_themes ft ON t.id = ft.theme_id
						LEFT JOIN feedback f ON ft.feedback_id = f.id
						WHERE t.status = 'active'
						GROUP BY t.id
						ORDER BY t.priority_score DESC 
						LIMIT ?
					`).bind(limit).all();

					// Return ARRAY directly (not wrapped in object)
					return new Response(JSON.stringify(results || []), {
						headers: { ...corsHeaders, 'Content-Type': 'application/json' }
					});
				} catch (error) {
					// Return empty array if tables don't exist yet
					return new Response(JSON.stringify([]), {
						headers: { ...corsHeaders, 'Content-Type': 'application/json' }
					});
				}
			}

			// Get theme by ID
			if (path.match(/^\/api\/themes\/[^\/]+$/) && request.method === 'GET') {
				const id = path.split('/')[3];
				
				const theme = await env.DB.prepare(
					'SELECT * FROM themes WHERE id = ?'
				).bind(id).first();

				if (!theme) {
					return new Response(JSON.stringify({ error: 'Theme not found' }), {
						status: 404,
						headers: { ...corsHeaders, 'Content-Type': 'application/json' }
					});
				}

				// Get linked feedback
				const { results: feedback } = await env.DB.prepare(`
					SELECT f.* FROM feedback f
					JOIN feedback_themes ft ON f.id = ft.feedback_id
					WHERE ft.theme_id = ?
					ORDER BY f.created_at DESC
				`).bind(id).all();

				return new Response(JSON.stringify({
					...theme,
					feedback: feedback || []
				}), {
					headers: { ...corsHeaders, 'Content-Type': 'application/json' }
				});
			}

			// Analyze themes - Extract themes from unthemed feedback using AI
			if (path === '/api/themes/analyze' && request.method === 'POST') {
				// Get feedback not yet assigned to themes
				const { results: unthemedFeedback } = await env.DB.prepare(`
					SELECT f.* FROM feedback f
					LEFT JOIN feedback_themes ft ON f.id = ft.feedback_id
					WHERE ft.theme_id IS NULL
					ORDER BY f.created_at DESC
					LIMIT 50
				`).all();

				if (!unthemedFeedback || unthemedFeedback.length === 0) {
					return new Response(JSON.stringify({ 
						message: 'No unthemed feedback to analyze',
						themes: []
					}), {
						headers: { ...corsHeaders, 'Content-Type': 'application/json' }
					});
				}

				// Use AI to extract themes
				const feedbackText = unthemedFeedback.map(f => f.text).join('\n---\n');
				
				const prompt = `Analyze the following customer feedback and identify 3-5 distinct themes.
For each theme, provide:
1. A descriptive name (format: [User/Segment] + [Problem] + [Context])
2. A brief description

Feedback:
${feedbackText.substring(0, 2000)}

Return ONLY a JSON array with this exact format:
[{"name": "...", "description": "..."}]`;

				let extractedThemes = [];
				try {
					if (env.AI) {
						const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
							prompt: prompt,
							max_tokens: 1024
						});

						const responseText = response.response || '';
						const jsonMatch = responseText.match(/\[[\s\S]*\]/);
						
						if (jsonMatch) {
							extractedThemes = JSON.parse(jsonMatch[0]);
						}
					}
				} catch (e) {
					console.error('AI theme extraction error:', e);
				}

				// Create themes in database
				const createdThemes = [];
				for (const theme of extractedThemes) {
					const id = crypto.randomUUID();
					const priority_score = 10; // Default medium priority
					
					await env.DB.prepare(`
						INSERT INTO themes (id, name, description, priority_band, priority_score, status)
						VALUES (?, ?, ?, 'medium', ?, 'active')
					`).bind(id, theme.name, theme.description, priority_score).run();

					createdThemes.push({ id, name: theme.name });
				}

				return new Response(JSON.stringify({
					message: 'Themes analyzed successfully',
					themes: createdThemes,
					analyzedFeedback: unthemedFeedback.length
				}), {
					headers: { ...corsHeaders, 'Content-Type': 'application/json' }
				});
			}

			// Initialize/seed data
			if (path === '/api/seed' && request.method === 'POST') {
				const mockFeedback = [
					{ text: "Dashboard UI is confusing, can't find WAF settings", source: "discord", user_tier: "paid" },
					{ text: "WAF false positives blocking legitimate traffic", source: "support", user_tier: "enterprise" },
					{ text: "Love the new Workers AI integration!", source: "github", user_tier: "paid" },
					{ text: "D1 migration docs are unclear", source: "community", user_tier: "free" }
				];

				for (const fb of mockFeedback) {
					const id = crypto.randomUUID();
					await env.DB.prepare(`
						INSERT INTO feedback (id, text, source, category, sentiment, user_tier)
						VALUES (?, ?, ?, 'complaint', 'neutral', ?)
					`).bind(id, fb.text, fb.source, fb.user_tier).run();
				}

				return new Response(JSON.stringify({ 
					message: 'Mock data seeded successfully',
					count: mockFeedback.length
				}), {
					headers: { ...corsHeaders, 'Content-Type': 'application/json' }
				});
			}

			// 404
			return new Response(JSON.stringify({ error: 'Not found' }), {
				status: 404,
				headers: { ...corsHeaders, 'Content-Type': 'application/json' }
			});

		} catch (error) {
			console.error('Worker error:', error);
			return new Response(JSON.stringify({ 
				error: error.message,
				stack: error.stack 
			}), {
				status: 500,
				headers: { ...corsHeaders, 'Content-Type': 'application/json' }
			});
		}
	}
};